import { serve } from "@hono/node-server";
import { loadConfig } from "./config.js";
import { createDatabase } from "./platform/db/index.js";
import { createFileStorage } from "./platform/storage.js";
import { createRuntime } from "./runtime.js";
import { createNotificationSender } from "./platform/notifications.js";

/**
 * Process entry point: build the runtime, serve it, run due background jobs on a timer and
 * shut all of it down in order. Everything it wires lives elsewhere — see runtime.ts for the
 * composition root.
 */

/** How long a shutdown may take before the process is killed regardless. */
const SHUTDOWN_DEADLINE_MS = 30_000;

const config = loadConfig();
const db = createDatabase(config.databaseUrl, config.databaseRootCertificate);
const storage = createFileStorage(config.storage);
await storage.initialize();

const runtime = createRuntime(config, db, storage, createNotificationSender(config));
const server = serve({ fetch: runtime.app.fetch, port: config.port, hostname: config.hostname });
console.info(`DopaFit listening on ${config.hostname}:${config.port}`);

let stopping = false;
/** The in-flight job run, doubling as the "a run is already going" flag. */
let runningJobs: Promise<unknown> | undefined;

function tick() {
  if (stopping || runningJobs) return;
  runningJobs = runtime.jobs
    .runDueTasks()
    .catch(console.error)
    .finally(() => {
      runningJobs = undefined;
    });
}

const timer = setInterval(tick, config.schedulerIntervalSeconds * 1000);
timer.unref();
tick();

async function shutdown() {
  if (stopping) return;
  stopping = true;

  // Fail readiness first so a load balancer drains this instance while the rest unwinds.
  runtime.setReady(false);
  clearInterval(timer);

  const deadline = setTimeout(() => process.exit(1), SHUTDOWN_DEADLINE_MS);
  deadline.unref();

  // Order matters: stop accepting requests, let the current job run finish, and only then
  // take away the resources both of them use.
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await runningJobs;
  await db.$client.end();
  storage.close();

  clearTimeout(deadline);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void shutdown().catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
  });
}
