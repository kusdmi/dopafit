import type { Database } from "../../platform/db/index.js";
import { AuthApplication } from "./application/service.js";
import { DrizzleAuthUnitOfWork } from "./infrastructure/repository.js";
import { CryptoSecurity } from "./infrastructure/security.js";
import type { AuthConfig } from "./domain/ports.js";

export type { AuthConfig, NotificationSender, Purpose } from "./domain/ports.js";

/**
 * Builds the auth application and the token check the HTTP layer authenticates with. The
 * operations themselves live in ./http/endpoints.ts.
 */
export function createAuthModule(db: Database, config: AuthConfig) {
  const application = new AuthApplication(
    new DrizzleAuthUnitOfWork(db),
    new CryptoSecurity(config.jwtSecret),
    config,
  );
  return {
    application,
    authenticate: (token: string) => application.authenticate(token),
  };
}
