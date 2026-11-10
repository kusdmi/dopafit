import { z } from "@hono/zod-openapi";

/**
 * The DTOs only commerce's operations name — subscriptions, checkout, gifts and referrals.
 *
 * Each is referenced by this module's endpoint declarations alone, which is what makes the
 * module the right owner: a DTO shared with another module would have to stay in the common
 * schema file instead. Relative order is the one they held there, since nothing depends on it
 * — `createContract` discovers schemas by walking the routes, and the emitted components are
 * sorted by name.
 */

export const AutoRenewRequest = z.object({ enabled: z.boolean() }).openapi("AutoRenewRequest");
export const CheckoutOut = z
  .object({ payment_id: z.string().uuid(), confirmation_url: z.string() })
  .openapi("CheckoutOut");
export const SubscriptionPlan = z.enum(["m1", "m6", "m12"]).openapi("SubscriptionPlan");
export const CheckoutRequest = z
  .object({ plan: SubscriptionPlan, request_id: z.string().uuid().optional() })
  .openapi("CheckoutRequest");
export const GiftRequest = z
  .object({
    plan: SubscriptionPlan,
    request_id: z.string().uuid().optional(),
    recipient_user_id: z.string().uuid().optional(),
    recipient: z.string().min(1).optional(),
  })
  .refine((v) => !!(v.recipient || v.recipient_user_id), "Recipient is required")
  .openapi("GiftRequest");
export const ReferralInfoOut = z
  .object({
    active_count: z.number().int(),
    code: z.string(),
    earned_days: z.number().int(),
    invited_count: z.number().int(),
    link: z.string(),
  })
  .openapi("ReferralInfoOut");
export const SubscriptionStatusOut = z
  .object({
    auto_renew: z.boolean(),
    benefits: z.array(z.string()),
    entitlements: z.lazy(() => EntitlementsOut).optional(),
    plans: z
      .array(z.object({ id: SubscriptionPlan, months: z.number(), price: z.number() }))
      .optional(),
    ends_at: z.union([z.string().datetime({ offset: true }), z.null()]),
    is_active: z.boolean(),
    manage_url: z.string(),
    tier: z.union([z.string(), z.null()]),
  })
  .openapi("SubscriptionStatusOut");
export const WebhookRequest = z
  .object({ event: z.string(), provider_payment_id: z.string() })
  .openapi("WebhookRequest");

export const EntitlementsOut = z
  .object({
    server_time: z.string(),
    is_active: z.boolean(),
    ends_at: z.string().nullable(),
    limits: z.object({
      own_programs: z.number(),
      client_programs: z.number(),
      days: z.number(),
      exercises: z.number(),
      alternatives: z.number(),
      clients: z.number(),
      registered_clients: z.number(),
      managed_clients: z.number(),
    }),
    free_limits: z.object({
      own_programs: z.number(),
      client_programs: z.number(),
      days: z.number(),
      exercises: z.number(),
      alternatives: z.number(),
      clients: z.number(),
      registered_clients: z.number(),
      managed_clients: z.number(),
    }),
    features: z.object({
      rest_timer: z.boolean(),
      share_results: z.boolean(),
      average_rest: z.boolean(),
      analytics_days: z.number().nullable(),
    }),
    usage: z.object({
      own_programs: z.number(),
      clients: z.number(),
      registered_clients: z.number(),
      managed_clients: z.number(),
    }),
    selection: z.object({
      cycle: z.string(),
      required: z.boolean(),
      confirmed: z.boolean(),
      program_ids: z.array(z.string()),
      client_ids: z.array(z.string()),
    }),
    programs: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        client_id: z.string().nullable(),
        compatible: z.boolean(),
      }),
    ),
    clients: z.array(z.object({ id: z.string(), name: z.string(), registered: z.boolean() })),
  })
  .openapi("EntitlementsOut");
export const PaymentStatusOut = z
  .object({
    payment_id: z.string().uuid(),
    status: z.enum(["pending", "succeeded", "failed", "cancelled"]),
  })
  .openapi("PaymentStatusOut");
