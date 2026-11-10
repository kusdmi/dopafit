import { z } from "@hono/zod-openapi";
import type { CalendarApplication } from "../application/calendar.js";
import * as s from "./schemas.js";
import { actor, id, number, time } from "./shared.js";
import { endpoint, type Endpoint, type EndpointPolicy } from "../../../endpoint.js";

/** The calendar belongs to a trainer: every operation can refuse a caller who is not one. */
const calendarPolicy = {
  security: [{ HTTPBearer: [] }],
  tags: ["calendar"],
  errors: [401, 403, 404, 422],
} satisfies EndpointPolicy;

/**
 * The trainer's calendar of scheduled sessions.
 *
 * Each entry pairs the route with the handler that implements it, so an operationId, a path
 * and a body schema are named once and cannot drift between two files.
 */
export function calendarEndpoints(calendar: CalendarApplication): Endpoint[] {
  return [
    endpoint({
      ...calendarPolicy,
      method: "get",
      path: "/api/v1/calendar/month",
      operationId: "calendar_get_month",
      summary: "Get Month",
      query: z.object({
        year: z.coerce.number().int().min(2020).max(2100),
        month: z.coerce.number().int().min(1).max(12),
      }),
      ok: s.CalendarMonthOut,
      handler: async (i) =>
        calendar.month(actor(i), number(i.query.year, 0), number(i.query.month, 0)),
    }),
    endpoint({
      ...calendarPolicy,
      method: "post",
      path: "/api/v1/calendar/events",
      operationId: "calendar_create_event",
      summary: "Create Event",
      body: s.EventCreateRequest,
      status: 201,
      ok: s.EventOut,
      handler: async (input) => {
        return calendar.create(actor(input), {
          date: input.body.date,
          program_id: input.body.program_id ?? null,
          time: time.parse(input.body.time),
          client_ids: input.body.client_ids ?? [],
        });
      },
    }),
    endpoint({
      ...calendarPolicy,
      method: "put",
      path: "/api/v1/calendar/events/{event_id}",
      operationId: "calendar_update_event",
      summary: "Update Event",
      params: z.object({ event_id: z.string().uuid() }),
      body: s.EventUpdateRequest,
      ok: s.EventOut,
      handler: async (input) => {
        return calendar.update(actor(input), id(input, "event_id"), {
          date: input.body.date,
          program_id: input.body.program_id,
          time: input.body.time == null ? input.body.time : time.parse(input.body.time),
          status: input.body.status,
          client_ids: input.body.client_ids,
        });
      },
    }),
    endpoint({
      ...calendarPolicy,
      method: "delete",
      path: "/api/v1/calendar/events/{event_id}",
      operationId: "calendar_cancel_event",
      summary: "Cancel Event",
      params: z.object({ event_id: z.string().uuid() }),
      status: 204,
      handler: async (i) => calendar.cancel(actor(i), id(i, "event_id")),
    }),
  ];
}
