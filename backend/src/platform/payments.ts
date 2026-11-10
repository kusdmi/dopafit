import { randomUUID } from "node:crypto";
import type { PaymentProvider, PaymentOutcome } from "../modules/commerce/index.js";

/**
 * Payment processing, as the process provides it.
 *
 * `PaymentProvider` is a port commerce declares and calls but must not implement: what
 * actually moves money is a payment gateway, which is the process's concern — the same
 * reason the S3 adapter and the notification sender next door implement training's
 * `FileStorage` and auth's `NotificationSender`.
 */

/**
 * A test double standing in for a real payment gateway that is not connected yet.
 *
 * Unlike the logging notification sender next door, this is not the real behaviour reduced
 * to a placeholder — it simulates one: `createPayment` invents a payment id and a
 * confirmation URL without contacting anything, and `parseWebhook` reports back whatever
 * outcome the caller claims rather than verifying a signature against a provider. No money
 * moves and nothing is checked, so "mock" is accurate rather than a name to retire.
 *
 * This is a placeholder for local development and test stands. Connecting a real gateway
 * (Stripe, YooKassa, ...) means adding an implementation here and selecting it by
 * configuration, not editing this one — and, per `config.ts`, wiring real webhook signature
 * verification at the same time, since that check is currently a no-op tolerated only
 * because nothing but this mock is in play.
 */
export class MockPaymentProvider implements PaymentProvider {
  constructor(private baseUrl: string) {}

  async createPayment(_user?: string, _plan?: string, _kind?: string, paymentId?: string) {
    const providerPaymentId = `mock_${randomUUID().replaceAll("-", "")}`;
    return {
      providerPaymentId,
      confirmationUrl: `${this.baseUrl.replace(/\/$/, "")}?payment_id=${paymentId ?? providerPaymentId}`,
    };
  }

  parseWebhook(payload: { provider_payment_id: string; event: string }) {
    const outcome: PaymentOutcome =
      payload.event === "succeeded"
        ? "succeeded"
        : payload.event === "canceled"
          ? "cancelled"
          : payload.event === "failed"
            ? "failed"
            : "unknown";
    return { providerPaymentId: payload.provider_payment_id, outcome };
  }
}
