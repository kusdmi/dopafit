import { describe, expect, it, vi } from "vitest";
import { CommerceService } from "../src/modules/commerce/application/service.js";
import type {
  CommerceRepository,
  CommerceUnitOfWork,
  Payment,
  PaymentProvider,
} from "../src/modules/commerce/domain/types.js";

function fixture(status: Payment["status"] = "pending") {
  const payment: Payment = {
    id: "payment",
    user_id: "buyer",
    recipient_user_id: null,
    plan: "m1",
    status,
  };
  const repo: CommerceRepository = {
    testExpiry: vi.fn(async () => {}),
    activeUser: vi.fn(async () => true),
    createPayment: vi.fn(async () => payment),
    resolveRecipient: vi.fn(async (q) => (q === "gone" ? null : q)),
    paymentByRequest: vi.fn(async () => null),
    ownedPayment: vi.fn(async () => null),
    completeCheckout: vi.fn(async () => {}),
    lockPayment: vi.fn(async () => payment),
    setPaymentStatus: vi.fn(async (_id, state) => {
      payment.status = state;
    }),
    lockGrants: vi.fn(async () => {}),
    activeSubscription: vi.fn(async () => null),
    extendSubscription: vi.fn(async () => {}),
    createSubscription: vi.fn(async () => {}),
    setAutoRenew: vi.fn(async () => {}),
    notify: vi.fn(async () => {}),
    lockReferral: vi.fn(async () => null),
    qualifyReferral: vi.fn(async () => {}),
    referralStats: vi.fn(async () => ({ code: "invite", invited: 0, qualified: 0 })),
  };
  const uow: CommerceUnitOfWork = { run: (work) => work(repo) };
  const provider: PaymentProvider = {
    createPayment: vi.fn(async () => ({
      providerPaymentId: "provider",
      confirmationUrl: "https://example.test/pay",
    })),
    parseWebhook: (p) => ({
      providerPaymentId: p.provider_payment_id,
      outcome: p.event === "succeeded" ? "succeeded" : p.event === "failed" ? "failed" : "unknown",
    }),
  };
  const push = { deliver: vi.fn(async () => {}) };
  return {
    repo,
    payment,
    push,
    provider,
    service: new CommerceService(uow, provider, push, () => new Date("2026-09-09T00:00:00Z")),
  };
}
describe("subscription rules independently of database/HTTP", () => {
  it("does not grant for intermediate events or downgrade a successful payment", async () => {
    const f = fixture();
    await f.service.webhook({ provider_payment_id: "p", event: "waiting" });
    expect(f.repo.createSubscription).not.toHaveBeenCalled();
    f.payment.status = "succeeded";
    await f.service.webhook({ provider_payment_id: "p", event: "failed" });
    expect(f.repo.setPaymentStatus).not.toHaveBeenCalled();
  });
  it("recovers an out-of-order failed payment, grants once, and tolerates push failure", async () => {
    const f = fixture("failed");
    f.push.deliver.mockRejectedValueOnce(new Error("provider down"));
    await f.service.webhook({ provider_payment_id: "p", event: "succeeded" });
    await f.service.webhook({ provider_payment_id: "p", event: "succeeded" });
    expect(f.repo.createSubscription).toHaveBeenCalledExactlyOnceWith(
      "buyer",
      new Date("2026-09-09T00:00:00Z"),
      new Date("2026-10-09T00:00:00Z"),
      "payment",
    );
    expect(f.repo.notify).toHaveBeenCalledOnce();
    expect(f.repo.lockGrants).toHaveBeenCalledWith("buyer");
  });
  it("refuses self gifts and unavailable recipients before creating a payment", async () => {
    const f = fixture();
    await expect(f.service.checkout("buyer", "m1", "buyer")).rejects.toMatchObject({
      code: "validation_error",
    });
    vi.mocked(f.repo.activeUser).mockResolvedValue(false);
    await expect(f.service.checkout("buyer", "m1", "gone")).rejects.toMatchObject({
      code: "not_found",
    });
    expect(f.provider.createPayment).not.toHaveBeenCalled();
  });
});
