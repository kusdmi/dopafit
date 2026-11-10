import type { Database } from "../../platform/db/index.js";
import { CommerceService } from "./application/service.js";
import type { PaymentProvider, PushDelivery } from "./domain/types.js";
import { DrizzleCommerceUnitOfWork } from "./infrastructure/repository.js";

export type { PaymentProvider, PaymentOutcome } from "./domain/types.js";

export interface CommerceOptions {
  provider: PaymentProvider;
  push: PushDelivery;
  logError?: (error: unknown) => void;
}

/** Builds the commerce service. Its HTTP surface lives in ./http/endpoints.ts. */
export function createCommerceModule(db: Database, options: CommerceOptions) {
  const service = new CommerceService(
    new DrizzleCommerceUnitOfWork(db),
    options.provider,
    options.push,
    () => new Date(),
    options.logError,
  );
  return { service };
}

export { PgEntitlements } from "./infrastructure/entitlements.js";
