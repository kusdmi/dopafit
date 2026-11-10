import { serveStatic } from "@hono/node-server/serve-static";
import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";
import { isIP } from "node:net";
import { sql } from "drizzle-orm";
import type { Config } from "./config.js";
import type { Database } from "./platform/db/index.js";
import { createApi } from "./http/app.js";
import { createAuthModule, type NotificationSender } from "./modules/auth/index.js";
import { createTrainingModule, type FileStorage } from "./modules/training/index.js";
import { createCommerceModule, PgEntitlements } from "./modules/commerce/index.js";
import { allEndpoints } from "./http/endpoints/index.js";
import { MockPaymentProvider } from "./platform/payments.js";
import { WebPushProvider } from "./platform/push.js";
import { YandexSmartCaptcha } from "./platform/captcha.js";
import { createMessagingModule } from "./modules/messaging/index.js";

/** Assets served under this prefix carry a content hash, so they can be cached forever. */
const IMMUTABLE_ASSET_PREFIX = "/assets/";
const ASSET_CACHE_CONTROL = "public, max-age=31536000, immutable";

function isApiPath(path: string): boolean {
  return path.startsWith("/api/") || path === "/api";
}

/**
 * The caller's IP, used for rate limiting.
 *
 * `X-Forwarded-For` is only consulted when the deployment says it sits behind a trusted
 * proxy — otherwise a client could set the header and pick its own rate-limit bucket. Caddy
 * appends the real peer address, so the last entry is the one to trust.
 */
function clientIpFrom(context: Context, trustProxy: boolean): string | null {
  const forwarded = trustProxy
    ? context.req.header("X-Forwarded-For")?.split(",").at(-1)?.trim()
    : undefined;
  if (forwarded && isIP(forwarded)) return forwarded;

  try {
    return getConnInfo(context).remote.address ?? null;
  } catch {
    return null;
  }
}

/**
 * Composition root: builds the four modules, wires them to each other and mounts the API
 * alongside the static PWA. The only place that knows which implementation backs which port.
 */
export function createRuntime(
  config: Config,
  db: Database,
  storage: FileStorage,
  sender: NotificationSender,
  logError: (error: unknown) => void = console.error,
) {
  // The modules form a cycle: messaging anonymises overdue accounts through auth, auth
  // qualifies referrals through commerce, and commerce notifies through messaging. Every one
  // of those crossings is an arrow, so the binding is read when the call happens rather than
  // when the module is built. That is what lets `messaging` name `auth` here, before the line
  // that declares it — deliberate, and the reason these three cannot be reordered into a
  // plain sequence.
  const messaging = createMessagingModule(db, {
    staleRunHours: config.schedulerStaleRunHours,
    onIntegrationError: logError,
    anonymizeOverdue: (userId) => auth.application.anonymizeOverdue(userId),
    // No keys configured means no push transport, and messaging falls back to the stand-in
    // that reports every send as undelivered — the deployment behaves exactly as it did
    // before Web Push existed, rather than failing to start over an optional integration.
    pushProvider: config.vapid ? new WebPushProvider(config.vapid) : undefined,
  });
  const commerce = createCommerceModule(db, {
    provider: new MockPaymentProvider(config.subscriptionUrl),
    push: messaging.push,
    logError,
  });
  const auth = createAuthModule(db, {
    ...config.auth,
    jwtSecret: config.jwtSecret,
    devVerificationCode: config.devVerificationCode,
    rotateDevVerificationCode: config.rotateDevVerificationCode,
    sender,
    captcha: config.captcha ? new YandexSmartCaptcha(config.captcha) : undefined,
    qualifyReferral: (userId) => commerce.service.qualify(userId),
    deleteObject: (key) => storage.delete(key),
    onIntegrationError: logError,
  });
  const training = createTrainingModule(db, storage, {
    access: (tx) => new PgEntitlements(tx),
    maxMediaBytes: config.maxMediaBytes,
    customExerciseLimit: config.customExerciseLimit,
    deliver: (message) => messaging.push.deliver(message),
    logError,
  });

  /** Cleared on shutdown so the readiness probe drains this instance before it stops. */
  let ready = true;

  const app = createApi({
    // Built from the same `allEndpoints` the contract export uses, so the served API and
    // `contracts/openapi.json` describe one and the same set of operations by construction.
    // All this root supplies is the real services to close over.
    endpoints: allEndpoints({
      auth: auth.application,
      captchaSiteKey: config.captcha?.siteKey,
      training: training.application,
      commerce: commerce.service,
      commerceOptions: {
        subscriptionUrl: config.subscriptionUrl,
        testPayments: !config.production,
        entitlements: (user) => db.transaction((tx) => new PgEntitlements(tx).state(user)),
        inviteUrl: config.inviteUrl,
      },
      messaging: messaging.application,
    }),
    authenticate: auth.authenticate,
    production: config.production,
    corsOrigins: config.corsOrigins,
    maxBodyBytes: config.maxBodyBytes,
    maxMediaBytes: config.maxMediaBytes,
    logError,
    clientIp: (context) => clientIpFrom(context, config.trustProxy),
  });

  // Probes for the orchestrator, outside the contract: they answer about this process, not
  // about the API.
  app.get("/health/live", (c) => c.json({ status: "ok" }));
  app.get("/health/ready", async (c) => {
    if (!ready) return c.json({ status: "unavailable" }, 503);
    try {
      await db.execute(sql`select 1`);
      return c.json({ status: "ok" });
    } catch {
      return c.json({ status: "unavailable" }, 503);
    }
  });

  // Приложение целиком за логином: индексировать в нём нечего, и в выдаче ему
  // делать нечего. `robots.txt` (frontend/public) закрывает обход у тех, кто
  // его читает, а этот заголовок — у тех, кто robots.txt игнорирует, но
  // X-Robots-Tag уважает; он же действует на уже известные краулеру адреса,
  // которые robots.txt из индекса не убирает.
  //
  // На превью ссылок это не влияет: карточку строят краулеры мессенджеров и
  // соцсетей по og-тегам, а X-Robots-Tag применяют к себе поисковые.
  // Заголовок не ставится на /api/* — туда краулер не ходит, а ответы API и
  // так не кэшируются площадками.
  app.use("*", async (c, next) => {
    if (!isApiPath(c.req.path)) c.header("X-Robots-Tag", "noindex, nofollow");
    return next();
  });

  app.use("*", async (c, next) => {
    if (isApiPath(c.req.path)) return next();

    // serveStatic builds its Response before invoking onFound, so a header set from that
    // callback lands on a copy the adapter never returns. Setting it on the returned Response
    // instead is reliable, and — unlike setting it up front — cannot leak a caching directive
    // onto a 404. Hashed assets are immutable; everything else (index.html, sw.js) must be
    // revalidated so a new deployment is picked up rather than served from a stale cache.
    const response = await serveStatic({ root: config.publicDirectory })(c, next);
    if (response instanceof Response && response.status === 200)
      response.headers.set(
        "Cache-Control",
        c.req.path.startsWith(IMMUTABLE_ASSET_PREFIX) ? ASSET_CACHE_CONTROL : "no-cache",
      );
    return response;
  });

  // SPA fallback. Anything that looks like a file, or that is not asking for a page, has had
  // its chance above: serving index.html for those would answer a missing asset with HTML
  // instead of a 404.
  app.get("*", async (c, next) => {
    const looksLikeFile = c.req.path.split("/").at(-1)?.includes(".");
    const wantsHtml = c.req.header("Accept")?.includes("text/html");
    if (isApiPath(c.req.path) || looksLikeFile || !wantsHtml) return next();

    c.header("Cache-Control", "no-cache");
    return serveStatic({ root: config.publicDirectory, path: "index.html" })(c, next);
  });

  return {
    app,
    jobs: messaging.jobs,
    setReady: (value: boolean) => {
      ready = value;
    },
  };
}
