import { z } from "@hono/zod-openapi";
import { endpoint, type Endpoint } from "../../endpoint.js";

/**
 * The body the liveness probe answers with.
 *
 * Declared here rather than in a schema file of its own: it is the only DTO the dispatcher
 * owns, one operation names it, and it describes the process rather than any domain — so
 * there is no module for it to move into, and a sibling file holding three lines would be a
 * directory entry standing in for a paragraph. The module schema files exist because each
 * carries dozens of DTOs; this carries one.
 */
export const HealthOut = z
  .object({ status: z.string().default("ok").optional() })
  .openapi("HealthOut");

/** Liveness of the API itself, inside the contract. */
export function healthEndpoints(): Endpoint[] {
  return [
    endpoint({
      method: "get",
      path: "/api/v1/health",
      operationId: "health_health",
      tags: ["health"],
      summary: "Health",
      security: [],
      ok: HealthOut,
      handler: async () => ({ status: "ok" }),
    }),
  ];
}
