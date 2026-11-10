import type { Database } from "../../platform/db/index.js";
import { MessagingApplication } from "./application/service.js";
import { MessagingUnitOfWork } from "./infrastructure/repository.js";
import type { Config, PushMessage } from "./domain/types.js";

export type { Config as MessagingConfig, PushProvider } from "./domain/types.js";

/**
 * Builds the messaging application, its push delivery port and its scheduled jobs. The HTTP
 * surface lives in ./http/endpoints.ts.
 */
export function createMessagingModule(db: Database, config: Config = {}) {
  const application = new MessagingApplication(
    new MessagingUnitOfWork(db),
    // No silent stand-in: without a provider, delivery reports failure instead of
    // pretending to have sent. A push that quietly goes nowhere is worse than one that
    // is recorded as undelivered.
    config.pushProvider ?? {
      async send() {
        return false;
      },
    },
    config,
  );
  return {
    application,
    push: { deliver: (message: PushMessage) => application.deliver(message) },
    jobs: {
      runDueTasks: (options?: { runDate?: string; only?: readonly string[] }) =>
        application.runDueTasks(options),
      reapStaleRuns: () => application.reapStaleRuns(),
    },
  };
}
