import { z } from "@hono/zod-openapi";
import type { ClientApplication } from "../application/clients.js";
import * as s from "./schemas.js";
import { actor, id } from "./shared.js";
import { endpoint, OkResponse, type Endpoint, type EndpointPolicy } from "../../../endpoint.js";

/** A client card belongs to one trainer, so every operation on one can refuse another's. */
const clientsPolicy = {
  security: [{ HTTPBearer: [] }],
  tags: ["clients"],
  errors: [401, 403, 404, 409, 422],
} satisfies EndpointPolicy;
/** A link request is addressed to the caller, so there is no separate ownership refusal. */
const linkRequests = {
  security: [{ HTTPBearer: [] }],
  tags: ["link-requests"],
  errors: [401, 404, 409, 422],
} satisfies EndpointPolicy;

const done = () => ({ ok: true });

/**
 * Clients, and the link requests that create them — one declaration per operation.
 *
 * Each entry pairs the route with the handler that implements it, so an operationId, a path
 * and a body schema are named once and cannot drift between two files.
 */
export function clientsEndpoints(clients: ClientApplication): Endpoint[] {
  return [
    endpoint({
      ...clientsPolicy,
      method: "get",
      path: "/api/v1/clients",
      operationId: "clients_list_clients",
      summary: "List Clients",
      ok: s.ClientsListOut,
      handler: async (i) => clients.list(actor(i)),
    }),
    // Declared before /api/v1/clients/{client_id} so the literal segment is matched first;
    // the parameterised route also demands a uuid, so the two could not collide anyway.
    endpoint({
      ...clientsPolicy,
      method: "get",
      path: "/api/v1/clients/my-trainer",
      operationId: "clients_get_my_trainer",
      summary: "Get My Trainer",
      ok: s.MyTrainerResponse,
      handler: async (i) => clients.myTrainer(actor(i)),
    }),
    endpoint({
      ...clientsPolicy,
      method: "post",
      path: "/api/v1/clients",
      operationId: "clients_create_client",
      summary: "Create Client",
      body: s.ClientCreateRequest,
      status: 201,
      ok: s.ClientOut,
      handler: async (input) => {
        return clients.create(actor(input), {
          display_name: input.body.display_name,
          phone: input.body.phone ?? null,
          injuries: input.body.injuries ?? null,
          start_date: input.body.start_date ?? null,
          note: input.body.note ?? null,
        });
      },
    }),
    endpoint({
      ...clientsPolicy,
      method: "get",
      path: "/api/v1/clients/{client_id}",
      operationId: "clients_get_client",
      summary: "Get Client",
      params: z.object({ client_id: z.string().uuid() }),
      ok: s.ClientDetailOut,
      handler: async (i) => clients.get(actor(i), id(i, "client_id")),
    }),
    endpoint({
      ...clientsPolicy,
      method: "put",
      path: "/api/v1/clients/{client_id}",
      operationId: "clients_update_client",
      summary: "Update Client",
      params: z.object({ client_id: z.string().uuid() }),
      body: s.ClientUpdateRequest,
      ok: s.ClientOut,
      handler: async (input) => {
        return clients.update(actor(input), id(input, "client_id"), {
          display_name: input.body.display_name,
          phone: input.body.phone,
          injuries: input.body.injuries,
          start_date: input.body.start_date,
          end_date: input.body.end_date,
        });
      },
    }),
    endpoint({
      ...clientsPolicy,
      method: "patch",
      path: "/api/v1/clients/{client_id}/trainer-fields",
      operationId: "clients_update_trainer_fields",
      summary: "Update Trainer Fields",
      params: z.object({ client_id: z.string().uuid() }),
      body: s.ClientTrainerFieldsUpdateRequest,
      ok: s.ClientDetailOut,
      handler: async (input) =>
        clients.note(actor(input), id(input, "client_id"), input.body.note ?? null),
    }),
    endpoint({
      ...clientsPolicy,
      method: "post",
      path: "/api/v1/clients/{client_id}/archive",
      operationId: "clients_archive_client",
      summary: "Archive Client",
      params: z.object({ client_id: z.string().uuid() }),
      ok: OkResponse,
      handler: async (i) => {
        await clients.status(actor(i), id(i, "client_id"), "archive");
        return done();
      },
    }),
    endpoint({
      ...clientsPolicy,
      method: "post",
      path: "/api/v1/clients/{client_id}/unarchive",
      operationId: "clients_unarchive_client",
      summary: "Unarchive Client",
      params: z.object({ client_id: z.string().uuid() }),
      ok: OkResponse,
      handler: async (i) => {
        await clients.status(actor(i), id(i, "client_id"), "unarchive");
        return done();
      },
    }),
    endpoint({
      ...clientsPolicy,
      method: "post",
      path: "/api/v1/clients/{client_id}/unlink",
      operationId: "clients_unlink_client",
      summary: "Unlink Client",
      params: z.object({ client_id: z.string().uuid() }),
      ok: OkResponse,
      handler: async (i) => {
        await clients.status(actor(i), id(i, "client_id"), "unlink");
        return done();
      },
    }),
    endpoint({
      ...linkRequests,
      method: "get",
      path: "/api/v1/link-requests",
      operationId: "link-requests_list_link_requests",
      summary: "List Link Requests",
      query: z.object({ direction: z.union([s.LinkRequestDirection, z.null()]).optional() }),
      ok: z.array(s.LinkRequestOut),
      handler: async (i) =>
        clients.requests(
          actor(i),
          s.LinkRequestDirection.nullable().parse(i.query.direction ?? null),
        ),
    }),
    endpoint({
      ...linkRequests,
      method: "post",
      path: "/api/v1/link-requests",
      operationId: "link-requests_create_link_request",
      summary: "Create Link Request",
      body: s.LinkRequestCreateRequest,
      status: 201,
      ok: s.LinkRequestOut,
      handler: async (input) => clients.request(actor(input), input.body.query),
    }),
    endpoint({
      ...linkRequests,
      method: "post",
      path: "/api/v1/link-requests/{request_id}/accept",
      operationId: "link-requests_accept_link_request",
      summary: "Accept Link Request",
      params: z.object({ request_id: z.string().uuid() }),
      ok: s.LinkRequestOut,
      handler: async (i) => clients.decide(actor(i), id(i, "request_id"), "accept"),
    }),
    endpoint({
      ...linkRequests,
      method: "post",
      path: "/api/v1/link-requests/{request_id}/decline",
      operationId: "link-requests_decline_link_request",
      summary: "Decline Link Request",
      params: z.object({ request_id: z.string().uuid() }),
      ok: s.LinkRequestOut,
      handler: async (i) => clients.decide(actor(i), id(i, "request_id"), "decline"),
    }),
    endpoint({
      ...linkRequests,
      method: "delete",
      path: "/api/v1/link-requests/{request_id}",
      operationId: "link-requests_cancel_link_request",
      summary: "Cancel Link Request",
      params: z.object({ request_id: z.string().uuid() }),
      status: 204,
      handler: async (i) => clients.decide(actor(i), id(i, "request_id"), "cancel"),
    }),
  ];
}
