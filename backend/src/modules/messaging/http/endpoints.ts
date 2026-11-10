import { z } from "@hono/zod-openapi";
import {
  endpoint,
  integerParam,
  OkResponse,
  requireUserId,
  type Endpoint,
  type EndpointPolicy,
} from "../../../endpoint.js";
import type { MessagingApplication } from "../application/service.js";
import type { Notification, Reply, Ticket } from "../domain/types.js";
import * as s from "./schemas.js";

/** Default page size for the notification feed when the caller does not ask for one. */
const DEFAULT_PAGE_SIZE = 20;

const notificationOut = (n: Notification) => ({
  id: n.id,
  type: n.type,
  title: n.title,
  body: n.body,
  payload: n.payload,
  is_read: n.is_read,
  created_at: n.created_at.toISOString(),
});
const ticketOut = (t: Ticket) => ({
  id: t.id,
  subject: t.subject,
  message: t.message,
  status: t.status,
  created_at: t.created_at.toISOString(),
});
const replyOut = (r: Reply) => ({
  id: r.id,
  author: r.author,
  body: r.body,
  created_at: r.created_at.toISOString(),
});

/** The user's own notification feed and settings. */
const notifications = {
  security: [{ HTTPBearer: [] }],
  tags: ["notifications"],
  errors: [401, 422],
} satisfies EndpointPolicy;
/** Support tickets, which additionally answer for a ticket that is missing or not the caller's. */
const support = {
  security: [{ HTTPBearer: [] }],
  tags: ["support"],
  errors: [401, 403, 404, 422],
} satisfies EndpointPolicy;

/**
 * Notifications, push tokens and support tickets — one declaration per operation.
 *
 * Each entry pairs the route with the handler that implements it, so an operationId, a path
 * and a body schema are named once and cannot drift between two files.
 */
export function messagingEndpoints(application: MessagingApplication): Endpoint[] {
  return [
    endpoint({
      ...notifications,
      method: "get",
      path: "/api/v1/notifications",
      operationId: "notifications_list_notifications",
      summary: "List Notifications",
      query: z.object({
        limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
        offset: integerParam({ min: 0 })
          .default(0)
          .optional()
          .openapi({ default: 0 } as never),
      }),
      ok: s.NotificationPage,
      handler: async (input) => {
        const page = await application.listNotifications(
          requireUserId(input),
          Number(input.query.limit ?? DEFAULT_PAGE_SIZE),
          Number(input.query.offset ?? 0),
        );
        return { ...page, items: page.items.map(notificationOut) };
      },
    }),
    endpoint({
      ...notifications,
      method: "post",
      path: "/api/v1/notifications/push-token",
      operationId: "notifications_register_push_token",
      summary: "Register Push Token",
      body: s.PushTokenRequest,
      ok: OkResponse,
      handler: async (input) => {
        const { token, platform, keys } = input.body;
        await application.registerToken(requireUserId(input), token, platform, keys ?? null);
        return { ok: true };
      },
    }),
    endpoint({
      ...notifications,
      method: "post",
      path: "/api/v1/notifications/read",
      operationId: "notifications_mark_read",
      summary: "Mark Read",
      body: s.MarkReadRequest,
      ok: OkResponse,
      handler: async (input) => {
        await application.markRead(requireUserId(input), input.body.notification_ids ?? null);
        return { ok: true };
      },
    }),
    endpoint({
      ...notifications,
      method: "post",
      path: "/api/v1/notifications/read-all",
      operationId: "notifications_mark_read_all",
      summary: "Mark Read All",
      ok: OkResponse,
      handler: async (input) => {
        await application.markRead(requireUserId(input), null);
        return { ok: true };
      },
    }),
    endpoint({
      ...notifications,
      method: "get",
      path: "/api/v1/notifications/settings",
      operationId: "notifications_get_settings",
      summary: "Get Settings",
      ok: s.NotificationSettingsOut,
      handler: async (input) => application.getSettings(requireUserId(input)),
    }),
    endpoint({
      ...notifications,
      method: "patch",
      path: "/api/v1/notifications/settings",
      operationId: "notifications_update_settings",
      summary: "Update Settings",
      body: s.NotificationSettingsUpdate,
      ok: s.NotificationSettingsOut,
      handler: async (input) => application.updateSettings(requireUserId(input), input.body),
    }),
    endpoint({
      ...support,
      method: "get",
      path: "/api/v1/support/tickets",
      operationId: "support_list_tickets",
      summary: "List Tickets",
      ok: z.array(s.TicketOut),
      handler: async (input) =>
        (await application.listTickets(requireUserId(input))).map(ticketOut),
    }),
    endpoint({
      ...support,
      method: "post",
      path: "/api/v1/support/tickets",
      operationId: "support_create_ticket",
      summary: "Create Ticket",
      body: s.TicketCreateRequest,
      status: 201,
      ok: s.TicketOut,
      handler: async (input) => {
        const { subject, message } = input.body;
        return ticketOut(await application.createTicket(requireUserId(input), subject, message));
      },
    }),
    endpoint({
      ...support,
      method: "get",
      path: "/api/v1/support/tickets/{ticket_id}",
      operationId: "support_get_ticket",
      summary: "Get Ticket",
      params: z.object({ ticket_id: z.string().uuid() }),
      ok: s.TicketDetailOut,
      handler: async (input) => {
        const result = await application.getTicket(requireUserId(input), input.params.ticket_id!);
        return { ...ticketOut(result), replies: result.replies.map(replyOut) };
      },
    }),
    endpoint({
      ...support,
      method: "post",
      path: "/api/v1/support/tickets/{ticket_id}/replies",
      operationId: "support_add_reply",
      summary: "Add Reply",
      params: z.object({ ticket_id: z.string().uuid() }),
      body: s.ReplyCreateRequest,
      ok: OkResponse,
      handler: async (input) => {
        await application.reply(requireUserId(input), input.params.ticket_id!, input.body.body);
        return { ok: true };
      },
    }),
  ];
}
