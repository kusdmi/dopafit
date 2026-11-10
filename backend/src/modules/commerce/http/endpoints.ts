import { z } from "@hono/zod-openapi";
import { AppError } from "../../../domain/error.js";
import { endpoint, OkResponse, requireUserId, type Endpoint } from "../../../endpoint.js";
import type { CommerceService } from "../application/service.js";
import { REFERRAL_BONUS_DAYS } from "../policy.js";
import * as s from "./schemas.js";

export interface CommerceHandlerOptions {
  /** Where the client is sent to manage a subscription, and the base for invite links. */
  subscriptionUrl: string;
  entitlements?: (user: string) => Promise<z.infer<typeof s.EntitlementsOut>>;
  testPayments?: boolean;
  inviteUrl: string;
}

/** Every operation in this module is behind a bearer token unless it says otherwise. */
const authenticated = [{ HTTPBearer: [] }];

/**
 * Subscriptions, payments and referrals — one declaration per operation.
 *
 * Each entry pairs the route with the handler that implements it, so an operationId, a path
 * and a body schema are named once and cannot drift between two files.
 */
export function commerceEndpoints(
  service: CommerceService,
  options: CommerceHandlerOptions,
): Endpoint[] {
  return [
    endpoint({
      method: "post",
      path: "/api/v1/subscriptions/activate",
      operationId: "subscriptions_activate",
      summary: "Activate free Premium during the test launch",
      tags: ["subscriptions"],
      security: authenticated,
      ok: s.SubscriptionStatusOut,
      errors: [401, 403],
      handler: async (input) => ({
        ...(await service.activate(requireUserId(input))),
        manage_url: options.subscriptionUrl,
        entitlements: await options.entitlements?.(requireUserId(input)),
      }),
    }),
    endpoint({
      method: "post",
      path: "/api/v1/subscriptions/test-expiry",
      summary: "Adjust subscription expiry in development",
      operationId: "subscriptions_test_expiry",
      tags: ["subscriptions"],
      security: authenticated,
      body: z.object({ seconds: z.number().int().min(-86400).max(2592000) }),
      ok: OkResponse,
      errors: [401, 403],
      handler: (i) => {
        if (!options.testPayments) throw new AppError("forbidden", "Test controls are disabled");
        return service.testExpiry(requireUserId(i), i.body.seconds);
      },
    }),
    endpoint({
      method: "get",
      path: "/api/v1/subscriptions/payments/{payment_id}",
      operationId: "subscriptions_payment_status",
      summary: "Payment status for its owner",
      tags: ["subscriptions"],
      security: authenticated,
      params: z.object({ payment_id: z.string().uuid() }),
      ok: s.PaymentStatusOut,
      errors: [401, 404],
      handler: (i) => service.payment(requireUserId(i), i.params.payment_id),
    }),
    endpoint({
      method: "post",
      path: "/api/v1/subscriptions/payments/{payment_id}/test",
      operationId: "subscriptions_test_payment",
      summary: "Set a mock payment outcome in development",
      tags: ["subscriptions"],
      security: authenticated,
      params: z.object({ payment_id: z.string().uuid() }),
      body: z.object({ outcome: z.enum(["succeeded", "failed", "canceled"]) }),
      ok: s.PaymentStatusOut,
      errors: [401, 403, 404],
      handler: (i) => {
        if (!options.testPayments) throw new AppError("forbidden", "Test controls are disabled");
        return service.testPayment(requireUserId(i), i.params.payment_id, i.body.outcome);
      },
    }),
    endpoint({
      method: "get",
      path: "/api/v1/referrals/me",
      operationId: "referrals_get_referral_info",
      tags: ["referrals"],
      summary: "Get Referral Info",
      security: authenticated,
      ok: s.ReferralInfoOut,
      errors: [401, 422],
      handler: async (input) => {
        const stats = await service.referralStats(requireUserId(input));
        return {
          code: stats.code,
          link: `${options.inviteUrl.replace(/\/$/, "")}/invite/${stats.code}`,
          invited_count: stats.invited,
          active_count: stats.qualified,
          earned_days: stats.qualified * REFERRAL_BONUS_DAYS,
        };
      },
    }),
    endpoint({
      method: "post",
      path: "/api/v1/subscriptions/auto-renew",
      operationId: "subscriptions_set_auto_renew",
      tags: ["subscriptions"],
      summary: "Set Auto Renew",
      security: authenticated,
      body: s.AutoRenewRequest,
      ok: OkResponse,
      errors: [401, 403, 404, 422],
      handler: async (input) => {
        await service.setAutoRenew(requireUserId(input), input.body.enabled);
        return { ok: true };
      },
    }),
    endpoint({
      method: "post",
      path: "/api/v1/subscriptions/checkout",
      operationId: "subscriptions_checkout",
      tags: ["subscriptions"],
      summary: "Checkout",
      security: authenticated,
      body: s.CheckoutRequest,
      ok: s.CheckoutOut,
      errors: [401, 403, 404, 422],
      handler: () => {
        throw new AppError("forbidden", "Оплата недоступна во время тестового запуска");
      },
    }),
    endpoint({
      method: "post",
      path: "/api/v1/subscriptions/gift",
      operationId: "subscriptions_gift",
      tags: ["subscriptions"],
      summary: "Gift",
      security: authenticated,
      body: s.GiftRequest,
      ok: s.CheckoutOut,
      errors: [401, 403, 404, 422],
      handler: () => {
        throw new AppError("forbidden", "Подарки недоступны во время тестового запуска");
      },
    }),
    endpoint({
      method: "get",
      path: "/api/v1/subscriptions/status",
      operationId: "subscriptions_get_status",
      tags: ["subscriptions"],
      summary: "Get Status",
      security: authenticated,
      ok: s.SubscriptionStatusOut,
      errors: [401, 403, 404, 422],
      handler: async (input) => ({
        ...(await service.state(requireUserId(input))),
        manage_url: options.subscriptionUrl,
        entitlements: await options.entitlements?.(requireUserId(input)),
      }),
    }),
    endpoint({
      method: "post",
      path: "/api/v1/subscriptions/webhook",
      operationId: "subscriptions_webhook",
      tags: ["subscriptions"],
      summary: "Webhook",
      security: [],
      headers: z.object({
        "x-webhook-signature": z
          .string()
          .describe("HMAC signature of the raw request body, verified in stage 15"),
      }),
      body: s.WebhookRequest,
      ok: OkResponse,
      errors: [401, 403, 404, 422],
      handler: async (input) => {
        // NOT AUTHENTICATED. This checks that a signature header is present; it does not
        // verify it, so anyone who can reach this endpoint can claim a payment succeeded and
        // be granted a subscription. Tolerable only while the provider is MockPaymentProvider.
        //
        // Before a real provider is connected this must become an HMAC of the raw body against
        // a shared secret, compared in constant time — which needs the raw bytes (the parsed
        // body will not do) and the secret in config.ts.
        if (options.testPayments === false)
          throw new AppError("forbidden", "Mock payments are disabled in production");
        if (!input.headers.has("X-Webhook-Signature"))
          throw new AppError("validation_error", "Request validation failed");
        await service.webhook(input.body);
        return { ok: true };
      },
    }),
  ];
}
