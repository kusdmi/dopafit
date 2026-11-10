import type { Endpoint } from "../../endpoint.js";
import type { AuthApplication } from "../../modules/auth/application/service.js";
import type { CommerceService } from "../../modules/commerce/application/service.js";
import type { MessagingApplication } from "../../modules/messaging/application/service.js";
import {
  commerceEndpoints,
  type CommerceHandlerOptions,
} from "../../modules/commerce/http/endpoints.js";
import { messagingEndpoints } from "../../modules/messaging/http/endpoints.js";
import { authEndpoints } from "../../modules/auth/http/endpoints.js";
import { healthEndpoints } from "./health.js";
import {
  trainingEndpoints,
  type Applications as TrainingApplications,
} from "../../modules/training/http/index.js";

/**
 * Everything the endpoint modules need in order to be built.
 *
 * Only the service *types* appear here — every field is an `import type` — so naming this
 * interface costs nothing at runtime and, crucially, drags no database, provider or config
 * module into whoever imports it. That is what lets the contract export build the same list
 * the server mounts while running without Postgres.
 */
export interface EndpointDependencies {
  auth: AuthApplication;
  captchaSiteKey?: string;
  training: TrainingApplications;
  commerce: CommerceService;
  commerceOptions: CommerceHandlerOptions;
  messaging: MessagingApplication;
}

/**
 * Every operation the API declares, as one flat list.
 *
 * The single enumeration of the endpoint modules, shared by the two callers that must never
 * disagree: `createRuntime`, which mounts these as the served API, and `contractEndpoints`,
 * which turns the same list into `contracts/openapi.json`. When those were two independent
 * lists, a module added to one and forgotten in the other shipped a contract documenting
 * routes the server answers with 404 — and nothing failed, because no test compared them.
 * Here there is only one list, so the two cannot drift apart at all.
 *
 * `createApi` sorts what it is given, so the order the modules appear in is not load-bearing.
 */
export function allEndpoints(dependencies: EndpointDependencies): Endpoint[] {
  return [
    ...authEndpoints(dependencies.auth, dependencies.captchaSiteKey),
    ...trainingEndpoints(dependencies.training),
    ...commerceEndpoints(dependencies.commerce, dependencies.commerceOptions),
    ...messagingEndpoints(dependencies.messaging),
    ...healthEndpoints(),
  ];
}
