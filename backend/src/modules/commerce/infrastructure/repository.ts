import { and, desc, eq, gt, lte, isNull, isNotNull, or, sql } from "drizzle-orm";
import type { Database } from "../../../platform/db/index.js";
import {
  notifications,
  payments,
  referrals,
  subscriptions,
  users,
} from "../../../platform/db/schema.js";
import type {
  CommerceRepository,
  CommerceUnitOfWork,
  Notification,
  Payment,
  Plan,
} from "../domain/types.js";
type Executor = Pick<Database, "select" | "insert" | "update" | "execute">;
export class DrizzleCommerceRepository implements CommerceRepository {
  constructor(private db: Executor) {}
  async testExpiry(user: string, ends: Date) {
    const [current] = await this.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.user_id, user))
      .orderBy(desc(subscriptions.ends_at))
      .limit(1);
    if (current)
      await this.db
        .update(subscriptions)
        .set({ ends_at: ends })
        .where(eq(subscriptions.id, current.id));
  }
  async activeUser(id: string) {
    return (
      (
        await this.db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.id, id), eq(users.is_active, true)))
      ).length > 0
    );
  }
  async createPayment(
    userId: string,
    plan: Plan,
    amount: number,
    providerId: string | null,
    recipientId: string | null,
    requestId?: string,
  ) {
    const [payment] = await this.db
      .insert(payments)
      .values({
        request_id: requestId,
        user_id: userId,
        plan,
        amount,
        provider_payment_id: providerId,
        recipient_user_id: recipientId,
        kind: recipientId ? "gift" : "purchase",
      })
      .returning();
    return payment;
  }
  async resolveRecipient(query: string) {
    const [user] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.is_active, true),
          query.includes("@")
            ? sql`lower(${users.email})=${query.trim().toLowerCase()}`
            : sql`${users.id}::text=${query}`,
        ),
      );
    return user?.id ?? null;
  }
  async paymentByRequest(user: string, request: string) {
    return (
      (
        await this.db
          .select()
          .from(payments)
          .where(and(eq(payments.user_id, user), eq(payments.request_id, request)))
      )[0] ?? null
    );
  }
  async ownedPayment(user: string, id: string) {
    return (
      (
        await this.db
          .select()
          .from(payments)
          .where(and(eq(payments.user_id, user), eq(payments.id, id)))
      )[0] ?? null
    );
  }
  async completeCheckout(id: string, providerId: string, url: string) {
    await this.db
      .update(payments)
      .set({ provider_payment_id: providerId, confirmation_url: url })
      .where(eq(payments.id, id));
  }
  async lockPayment(providerId: string) {
    return (
      (
        await this.db
          .select()
          .from(payments)
          .where(eq(payments.provider_payment_id, providerId))
          .for("update")
      )[0] ?? null
    );
  }
  async setPaymentStatus(id: string, status: Payment["status"]) {
    await this.db.update(payments).set({ status }).where(eq(payments.id, id));
  }
  async lockGrants(userId: string) {
    await this.db.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`entitlements:${userId}`},0))`,
    );
  }
  async activeSubscription(userId: string, now: Date, timedOnly = false) {
    return (
      (
        await this.db
          .select()
          .from(subscriptions)
          .where(
            and(
              eq(subscriptions.user_id, userId),
              eq(subscriptions.status, "active"),
              lte(subscriptions.starts_at, now),
              or(isNull(subscriptions.ends_at), gt(subscriptions.ends_at, now)),
              timedOnly ? isNotNull(subscriptions.ends_at) : undefined,
            ),
          )
          .orderBy(desc(subscriptions.ends_at))
          .limit(1)
      )[0] ?? null
    );
  }
  async extendSubscription(id: string, endsAt: Date) {
    await this.db.update(subscriptions).set({ ends_at: endsAt }).where(eq(subscriptions.id, id));
  }
  async createSubscription(
    userId: string,
    startsAt: Date,
    endsAt: Date | null,
    paymentId: string | null,
  ) {
    await this.db.insert(subscriptions).values({
      user_id: userId,
      starts_at: startsAt,
      ends_at: endsAt,
      source_payment_id: paymentId,
    });
  }
  async setAutoRenew(id: string, enabled: boolean) {
    await this.db
      .update(subscriptions)
      .set({ auto_renew: enabled })
      .where(eq(subscriptions.id, id));
  }
  async notify(n: Notification) {
    await this.db.insert(notifications).values({
      user_id: n.userId,
      type: n.type,
      title: n.title,
      body: n.body,
      payload: n.data ?? null,
    });
  }
  async lockReferral(userId: string) {
    return (
      (
        await this.db
          .select()
          .from(referrals)
          .where(eq(referrals.referred_user_id, userId))
          .for("update")
      )[0] ?? null
    );
  }
  async qualifyReferral(id: string, now: Date) {
    await this.db
      .update(referrals)
      .set({ status: "qualified", bonus_granted_at: now })
      .where(eq(referrals.id, id));
  }
  async referralStats(userId: string) {
    const user = (
      await this.db.select({ code: users.referral_code }).from(users).where(eq(users.id, userId))
    )[0];
    const rows = await this.db
      .select({ status: referrals.status })
      .from(referrals)
      .where(eq(referrals.referrer_id, userId));
    return {
      code: user?.code ?? "",
      invited: rows.length,
      qualified: rows.filter((r) => r.status === "qualified").length,
    };
  }
}
export class DrizzleCommerceUnitOfWork implements CommerceUnitOfWork {
  constructor(private db: Database) {}
  run<T>(work: (repo: CommerceRepository) => Promise<T>) {
    return this.db.transaction((tx) => work(new DrizzleCommerceRepository(tx)));
  }
}
