export type Plan = "m1" | "m6" | "m12";
export type PaymentOutcome = "succeeded" | "failed" | "cancelled" | "unknown";
export interface Payment {
  id: string;
  user_id: string;
  recipient_user_id: string | null;
  plan: Plan;
  status: "pending" | "succeeded" | "failed" | "cancelled";
}
export interface Subscription {
  id: string;
  user_id: string;
  starts_at: Date;
  ends_at: Date | null;
  tier: string;
  auto_renew: boolean;
}
export interface Referral {
  id: string;
  referrer_id: string;
  status: "pending" | "qualified";
}
export type NotificationType =
  | "workout_reminder"
  | "subscription"
  | "referral"
  | "support"
  | "system"
  | "link_request"
  | "account";
export interface Notification {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}
export interface PushDelivery {
  deliver(notification: Notification): Promise<void>;
}
export interface PaymentProvider {
  createPayment(
    userId: string,
    plan: Plan,
    kind: "purchase" | "gift",
    paymentId?: string,
  ): Promise<{ providerPaymentId: string; confirmationUrl: string }>;
  parseWebhook(payload: { provider_payment_id: string; event: string }): {
    providerPaymentId: string;
    outcome: PaymentOutcome;
  };
}
export interface CommerceRepository {
  activeUser(id: string): Promise<boolean>;
  testExpiry(user: string, ends: Date): Promise<void>;
  resolveRecipient(query: string): Promise<string | null>;
  paymentByRequest(
    user: string,
    request: string,
  ): Promise<(Payment & { confirmation_url: string | null }) | null>;
  ownedPayment(
    user: string,
    id: string,
  ): Promise<(Payment & { provider_payment_id: string | null }) | null>;
  completeCheckout(id: string, providerId: string, url: string): Promise<void>;
  createPayment(
    userId: string,
    plan: Plan,
    amount: number,
    providerId: string | null,
    recipientId: string | null,
    requestId?: string,
  ): Promise<Payment>;
  lockPayment(providerId: string): Promise<Payment | null>;
  setPaymentStatus(id: string, status: Payment["status"]): Promise<void>;
  lockGrants(userId: string): Promise<void>;
  activeSubscription(userId: string, now: Date, timedOnly?: boolean): Promise<Subscription | null>;
  extendSubscription(id: string, endsAt: Date): Promise<void>;
  createSubscription(
    userId: string,
    startsAt: Date,
    endsAt: Date | null,
    paymentId: string | null,
  ): Promise<void>;
  setAutoRenew(id: string, enabled: boolean): Promise<void>;
  notify(notification: Notification): Promise<void>;
  lockReferral(referredUserId: string): Promise<Referral | null>;
  qualifyReferral(id: string, now: Date): Promise<void>;
  referralStats(userId: string): Promise<{ code: string; invited: number; qualified: number }>;
}
export interface CommerceUnitOfWork {
  run<T>(work: (repo: CommerceRepository) => Promise<T>): Promise<T>;
}
