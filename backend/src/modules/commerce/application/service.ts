import { AppError } from "../../../domain/error.js";
import { messages } from "../messages.js";
import { MS_PER_DAY, PLANS, planDays, REFERRAL_BONUS_DAYS } from "../policy.js";
import type {
  CommerceRepository,
  CommerceUnitOfWork,
  Notification,
  PaymentProvider,
  Plan,
  PushDelivery,
} from "../domain/types.js";
export class CommerceService {
  constructor(
    private uow: CommerceUnitOfWork,
    private provider: PaymentProvider,
    private push: PushDelivery,
    private now = () => new Date(),
    private logError: (error: unknown) => void = () => {},
  ) {}
  private async deliver(notification: Notification | null) {
    if (!notification) return;
    try {
      await this.push.deliver(notification);
    } catch (error) {
      this.logError(error);
    }
  }
  private async grant(
    repo: CommerceRepository,
    userId: string,
    days: number,
    paymentId: string | null,
    notification: Notification,
  ) {
    await repo.lockGrants(userId);
    const now = this.now();
    const current = await repo.activeSubscription(userId, now, true);
    // Extends from the end of an active subscription, so buying again never loses time.
    const end = new Date((current?.ends_at ?? now).getTime() + days * MS_PER_DAY);
    if (current) await repo.extendSubscription(current.id, end);
    else await repo.createSubscription(userId, now, end, paymentId);
    await repo.notify(notification);
  }
  async webhook(payload: { provider_payment_id: string; event: string }) {
    const event = this.provider.parseWebhook(payload);
    const notification = await this.uow.run(async (repo) => {
      const payment = await repo.lockPayment(event.providerPaymentId);
      if (!payment) throw new AppError("not_found", "Unknown payment");
      if (event.outcome === "unknown" || payment.status === "succeeded") return null;
      if (event.outcome === "failed" || event.outcome === "cancelled") {
        if (payment.status === "pending") await repo.setPaymentStatus(payment.id, event.outcome);
        return null;
      }
      await repo.setPaymentStatus(payment.id, "succeeded");
      const beneficiary = payment.recipient_user_id ?? payment.user_id;
      const notice: Notification = {
        userId: beneficiary,
        type: "subscription",
        ...messages.subscriptionActive,
      };
      await this.grant(repo, beneficiary, planDays(payment.plan), payment.id, notice);
      return notice;
    });
    await this.deliver(notification);
  }
  async qualify(userId: string) {
    const notification = await this.uow.run(async (repo) => {
      const referral = await repo.lockReferral(userId);
      if (!referral || referral.status === "qualified") return null;
      await repo.qualifyReferral(referral.id, this.now());
      const notice: Notification = {
        userId: referral.referrer_id,
        type: "referral",
        ...messages.referralQualified,
      };
      await this.grant(repo, referral.referrer_id, REFERRAL_BONUS_DAYS, null, notice);
      return notice;
    });
    await this.deliver(notification);
  }
  async activate(userId: string) {
    const notification = await this.uow.run(async (repo) => {
      await repo.lockGrants(userId);
      if (!(await repo.activeUser(userId))) throw new AppError("forbidden", "Account unavailable");
      const current = await repo.activeSubscription(userId, this.now());
      if (current && current.ends_at === null) return null;
      await repo.createSubscription(userId, this.now(), null, null);
      const notice: Notification = { userId, type: "subscription", ...messages.subscriptionActive };
      await repo.notify(notice);
      return notice;
    });
    await this.deliver(notification);
    return this.state(userId);
  }
  async checkout(
    userId: string,
    plan: Plan,
    recipientQuery: string | null = null,
    requestId: string = crypto.randomUUID(),
  ) {
    return this.uow.run(async (r) => {
      await r.lockGrants(userId);
      const previous = await r.paymentByRequest(userId, requestId);
      const recipientId = recipientQuery ? await r.resolveRecipient(recipientQuery) : null;
      if (recipientQuery && !recipientId) throw new AppError("not_found", "Recipient not found");
      if (recipientId === userId)
        throw new AppError("validation_error", "Cannot gift a subscription to yourself");
      if (previous) {
        if (previous.plan !== plan || previous.recipient_user_id !== recipientId)
          throw new AppError("conflict", "Request UUID already used for a different checkout");
        return { payment_id: previous.id, confirmation_url: previous.confirmation_url ?? "" };
      }
      const payment = await r.createPayment(
        userId,
        plan,
        PLANS[plan].price,
        null,
        recipientId,
        requestId,
      );
      const provider = await this.provider.createPayment(
        userId,
        plan,
        recipientId ? "gift" : "purchase",
        payment.id,
      );
      await r.completeCheckout(payment.id, provider.providerPaymentId, provider.confirmationUrl);
      return { payment_id: payment.id, confirmation_url: provider.confirmationUrl };
    });
  }
  async testExpiry(userId: string, seconds: number) {
    await this.uow.run(async (r) => {
      await r.lockGrants(userId);
      await r.testExpiry(userId, new Date(this.now().getTime() + seconds * 1000));
    });
    return { ok: true };
  }
  async payment(userId: string, id: string) {
    const payment = await this.uow.run((r) => r.ownedPayment(userId, id));
    if (!payment) throw new AppError("not_found", "Payment not found");
    return { payment_id: payment.id, status: payment.status };
  }
  async testPayment(userId: string, id: string, outcome: "succeeded" | "failed" | "canceled") {
    const payment = await this.uow.run((r) => r.ownedPayment(userId, id));
    if (!payment?.provider_payment_id) throw new AppError("not_found", "Payment not found");
    await this.webhook({ provider_payment_id: payment.provider_payment_id, event: outcome });
    return this.payment(userId, id);
  }
  async state(userId: string) {
    const subscription = await this.uow.run((r) => r.activeSubscription(userId, this.now()));
    return {
      is_active: !!subscription,
      tier: subscription?.tier ?? null,
      ends_at: subscription?.ends_at?.toISOString() ?? null,
      auto_renew: subscription?.auto_renew ?? false,
      // Copied rather than handed over: `messages` is `as const`, so `benefits` is a readonly
      // tuple, and the contract declares a plain `string[]`. Spreading here keeps the shared
      // constant immutable while giving the response the mutable array it is documented as.
      benefits: [...messages.benefits],
    };
  }
  async setAutoRenew(userId: string, enabled: boolean) {
    await this.uow.run(async (repo) => {
      await repo.lockGrants(userId);
      const current = await repo.activeSubscription(userId, this.now());
      if (!current) throw new AppError("not_found", "No active subscription");
      if (enabled && current.ends_at === null)
        throw new AppError("forbidden", "Автопродление недоступно для тестового Premium");
      await repo.setAutoRenew(current.id, enabled);
    });
  }
  referralStats(userId: string) {
    return this.uow.run((r) => r.referralStats(userId));
  }
}
