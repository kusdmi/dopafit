import { z } from "@hono/zod-openapi";

/**
 * The DTOs only messaging's operations name — the notification feed, push tokens, delivery
 * settings and support tickets.
 *
 * Each is referenced by this module's endpoint declarations alone, which is what makes the
 * module the right owner: a DTO shared with another module would have to stay in the common
 * schema file instead.
 *
 * NotificationSettingsOut/Update are the single description of which notifications a user
 * wants. The profile schemas used to carry a second, parallel one (`SettingsOut
 * .notification_types`) over its own table, with field names that did not even match; it fed
 * no delivery decision and no screen, so it was removed rather than kept in sync.
 *
 * Relative order is the one they held there, since nothing depends on it — `createContract`
 * discovers schemas by walking the routes, and the emitted components are sorted by name.
 *
 * These are the wire shapes. The module's own `domain/types.ts` declares Notification, Reply
 * and Ticket, which are what the application actually works with; the endpoint handlers map
 * one to the other.
 */

export const MarkReadRequest = z
  .object({ notification_ids: z.union([z.array(z.string().uuid()), z.null()]).optional() })
  .openapi("MarkReadRequest");
export const NotificationType = z
  .enum([
    "workout_reminder",
    "subscription",
    "referral",
    "support",
    "system",
    "link_request",
    "account",
  ])
  .openapi("NotificationType");
export const NotificationOut = z
  .object({
    body: z.string(),
    created_at: z.string().datetime({ offset: true }),
    id: z.string().uuid(),
    is_read: z.boolean(),
    payload: z.union([z.object({}).passthrough(), z.null()]).optional(),
    title: z.string(),
    type: NotificationType,
  })
  .openapi("NotificationOut");
export const NotificationPage = z
  .object({ items: z.array(NotificationOut), total: z.number().int(), unread: z.number().int() })
  .openapi("NotificationPage");
export const NotificationSettingsOut = z
  .object({
    measurement_reminders: z.boolean(),
    motivational: z.boolean(),
    new_features: z.boolean(),
    progress_updates: z.boolean(),
    push_enabled: z.boolean(),
    weekly_reports: z.boolean(),
    workout_reminders: z.boolean(),
  })
  .openapi("NotificationSettingsOut");
export const NotificationSettingsUpdate = z
  .object({
    measurement_reminders: z.union([z.boolean(), z.null()]).optional(),
    motivational: z.union([z.boolean(), z.null()]).optional(),
    new_features: z.union([z.boolean(), z.null()]).optional(),
    progress_updates: z.union([z.boolean(), z.null()]).optional(),
    push_enabled: z.union([z.boolean(), z.null()]).optional(),
    weekly_reports: z.union([z.boolean(), z.null()]).optional(),
    workout_reminders: z.union([z.boolean(), z.null()]).optional(),
  })
  .openapi("NotificationSettingsUpdate");
export const PushKeys = z
  .object({ auth: z.string().min(1).max(256), p256dh: z.string().min(1).max(256) })
  .openapi("PushKeys");
export const PushTokenRequest = z
  .object({
    keys: z.union([PushKeys, z.null()]).optional(),
    platform: z.string().regex(new RegExp("^(ios|android|web)$")),
    token: z.string().min(1).max(1024),
  })
  .openapi("PushTokenRequest");
export const ReplyCreateRequest = z
  .object({ body: z.string().min(1).max(5000) })
  .openapi("ReplyCreateRequest");
export const SupportAuthor = z.enum(["user", "admin"]).openapi("SupportAuthor");
export const ReplyOut = z
  .object({
    author: SupportAuthor,
    body: z.string(),
    created_at: z.string().datetime({ offset: true }),
    id: z.string().uuid(),
  })
  .openapi("ReplyOut");
export const TicketCreateRequest = z
  .object({ message: z.string().min(1).max(5000), subject: z.string().min(1).max(255) })
  .openapi("TicketCreateRequest");
export const TicketStatus = z.enum(["open", "answered", "closed"]).openapi("TicketStatus");
export const TicketDetailOut = z
  .object({
    created_at: z.string().datetime({ offset: true }),
    id: z.string().uuid(),
    message: z.string(),
    replies: z.array(ReplyOut),
    status: TicketStatus,
    subject: z.string(),
  })
  .openapi("TicketDetailOut");
export const TicketOut = z
  .object({
    created_at: z.string().datetime({ offset: true }),
    id: z.string().uuid(),
    message: z.string(),
    status: TicketStatus,
    subject: z.string(),
  })
  .openapi("TicketOut");
