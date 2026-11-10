import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDatabase } from "./database.js";
import { createApi } from "../src/http/app.js";
import { createCommerceModule } from "../src/modules/commerce/index.js";
import { commerceEndpoints } from "../src/modules/commerce/http/endpoints.js";
import type { Notification } from "../src/modules/commerce/domain/types.js";
import { PgEntitlements } from "../src/modules/commerce/infrastructure/entitlements.js";
import { MockPaymentProvider } from "../src/platform/payments.js";
import {
  notifications,
  payments,
  referrals,
  subscriptions,
  users,
} from "../src/platform/db/schema.js";

const { db, dispose } = await createTestDatabase();
afterAll(dispose);
const deliver = vi.fn(async (notification: Notification) => {
  void notification;
});
const commerce = createCommerceModule(db, {
  provider: new MockPaymentProvider("https://payments.example.test"),
  push: { deliver },
});
const api = createApi({
  endpoints: commerceEndpoints(commerce.service, {
    subscriptionUrl: "https://example.test/subscription",
    inviteUrl: "https://example.test",
    testPayments: true,
  }),
  authenticate: async (token) => ({ id: token, role: "client" }),
});

const DAY = 86400000;

async function account() {
  const id = randomUUID();
  await db.insert(users).values({ id, role: "client", referral_code: id.slice(0, 16) });
  return id;
}
function request(path: string, body: unknown, token?: string, signed = true) {
  return api.request(`/api/v1/subscriptions/${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(signed ? { "X-Webhook-Signature": "mock" } : {}),
    },
    body: JSON.stringify(body),
  });
}
function statusOf(user: string) {
  return api.request("/api/v1/subscriptions/status", {
    headers: { authorization: `Bearer ${user}` },
  });
}
function setAutoRenew(user: string, enabled: boolean) {
  return api.request("/api/v1/subscriptions/auto-renew", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${user}` },
    body: JSON.stringify({ enabled }),
  });
}
function referralInfo(user: string) {
  return api.request("/api/v1/referrals/me", { headers: { authorization: `Bearer ${user}` } });
}
/** The provider hands the payment id back only inside the confirmation URL. */
function paymentIdOf(confirmationUrl: string) {
  return new URL(confirmationUrl).searchParams.get("payment_id")!;
}
/** Starts a checkout (or a gift, when a recipient is given) and returns the provider id. */
async function startCheckout(user: string, plan: "m1" | "m6" | "m12", recipient?: string) {
  const result = await commerce.service.checkout(user, plan, recipient ?? null);
  expect(paymentIdOf(result.confirmation_url)).toBe(result.payment_id);
  return (await db.select().from(payments).where(eq(payments.id, result.payment_id)))[0]!
    .provider_payment_id!;
}
/** Inserts a pending payment directly, for the cases that never go through checkout. */
async function pendingPayment(user: string, recipient: string | null = null) {
  const provider_payment_id = randomUUID();
  await db.insert(payments).values({
    user_id: user,
    amount: 49900,
    plan: "m1",
    kind: recipient ? "gift" : "purchase",
    provider_payment_id,
    recipient_user_id: recipient,
  });
  return provider_payment_id;
}
function paymentRow(providerId: string) {
  return db.select().from(payments).where(eq(payments.provider_payment_id, providerId));
}
function grantsOf(user: string) {
  return db.select().from(subscriptions).where(eq(subscriptions.user_id, user));
}
function noticesOf(user: string) {
  return db.select().from(notifications).where(eq(notifications.user_id, user));
}
/**
 * Push deliveries for one user.
 *
 * `deliver` is a module-level spy shared by every test, so it is never reset — instead each
 * test owns a freshly created user id and filters by it, which makes the count belong to
 * that test alone rather than to whatever ran before it.
 */
function pushesTo(user: string) {
  return deliver.mock.calls.filter(([n]) => n.userId === user);
}
/**
 * Drives a payment all the way to a granted subscription, gift included.
 *
 * The two status checks folded in here were assertions of their own in the block this file
 * was split out of; they stay as assertions rather than bare awaits so a checkout or a
 * webhook that stops returning 200 still fails loudly in whichever test used it as setup.
 */
async function buy(user: string, plan: "m1" | "m6" | "m12" = "m1", recipient?: string) {
  const providerId = await startCheckout(user, plan, recipient);
  expect(
    (await request("webhook", { provider_payment_id: providerId, event: "succeeded" })).status,
  ).toBe(200);
  return providerId;
}

describe("commerce PostgreSQL transactions and HTTP", () => {
  it("activates free Premium once under concurrent requests without payments", async () => {
    const user = await account();
    expect((await request("activate", {})).status).toBe(401);
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => request("activate", {}, user)),
    );
    expect(responses.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    expect(await (await statusOf(user)).json()).toMatchObject({
      is_active: true,
      ends_at: null,
      auto_renew: false,
    });
    expect(await grantsOf(user)).toHaveLength(1);
    expect(await noticesOf(user)).toHaveLength(1);
    expect(pushesTo(user)).toHaveLength(1);
    expect(await db.select().from(payments).where(eq(payments.user_id, user))).toHaveLength(0);
    expect((await request("checkout", { plan: "m1" }, user)).status).toBe(403);
    expect((await setAutoRenew(user, true)).status).toBe(403);
  });
  it("applies open-term entitlements and returns to free limits when the launch term ends", async () => {
    const user = await account();
    await request("activate", {}, user);
    const active = await db.transaction(async (tx) => {
      const access = new PgEntitlements(tx);
      expect(await access.premium(user)).toBe(true);
      return access.state(user);
    });
    expect(active).toMatchObject({
      is_active: true,
      ends_at: null,
      limits: { own_programs: 100 },
      features: { rest_timer: true, analytics_days: null },
    });
    await commerce.service.testExpiry(user, -1);
    const expired = await db.transaction(async (tx) => {
      const access = new PgEntitlements(tx);
      expect(await access.premium(user)).toBe(false);
      return access.state(user);
    });
    expect(expired.is_active).toBe(false);
    expect(expired.limits.own_programs).toBe(1);
    expect(expired.selection.cycle).not.toBe("never-premium");
    expect((await (await statusOf(user)).json()).is_active).toBe(false);
  });
  it("preserves referral days alongside open launch access", async () => {
    const user = await account();
    const invited = await account();
    await request("activate", {}, user);
    await db.insert(referrals).values({ referrer_id: user, referred_user_id: invited });
    await commerce.service.qualify(invited);
    const grants = await grantsOf(user);
    expect(grants).toHaveLength(2);
    const timed = grants.find((g) => g.ends_at !== null)!;
    expect(timed.ends_at!.getTime() - timed.starts_at.getTime()).toBe(7 * DAY);
    expect(await (await statusOf(user)).json()).toMatchObject({ is_active: true, ends_at: null });
  });
  it("keeps timed grants separate from open launch access", async () => {
    const user = await account();
    await buy(user);
    const end = (await grantsOf(user))[0]!.ends_at;
    await request("activate", {}, user);
    await buy(user);
    const grants = await grantsOf(user);
    expect(grants).toHaveLength(2);
    expect(grants.find((g) => g.ends_at !== null)!.ends_at!.getTime()).toBe(
      end!.getTime() + 30 * DAY,
    );
    expect(grants.filter((g) => g.ends_at === null)).toHaveLength(1);
  });

  it("creates one payment for concurrent request UUIDs and hides status from another owner", async () => {
    const buyer = await account();
    const other = await account();
    const request_id = randomUUID();
    const responses = await Promise.all([
      commerce.service.checkout(buyer, "m6", null, request_id),
      commerce.service.checkout(buyer, "m6", null, request_id),
    ]);
    const [first, second] = responses;
    expect(first).toEqual(second);
    const read = (id: string) =>
      api.request(`/api/v1/subscriptions/payments/${first.payment_id}`, {
        headers: { authorization: `Bearer ${id}` },
      });
    expect((await read(other)).status).toBe(404);
    expect(await (await read(buyer)).json()).toMatchObject({ status: "pending" });
    await expect(commerce.service.checkout(buyer, "m1", null, request_id)).rejects.toMatchObject({
      code: "conflict",
    });
    await request(`payments/${first.payment_id}/test`, { outcome: "succeeded" }, buyer);
    await request(`payments/${first.payment_id}/test`, { outcome: "succeeded" }, buyer);
    expect(await grantsOf(buyer)).toHaveLength(1);
    expect(await (await read(buyer)).json()).toMatchObject({ status: "succeeded" });
  });
  it("resolves gifts by exact normalized email, adds to the recipient term, and never matches a substring", async () => {
    const buyer = await account();
    const recipient = await account();
    const email = `${recipient}@example.test`;
    await db.update(users).set({ email }).where(eq(users.id, recipient));
    await buy(recipient);
    const before = (await grantsOf(recipient))[0]!.ends_at;
    const payment = await commerce.service.checkout(buyer, "m6", email.toUpperCase());
    await request(`payments/${payment.payment_id}/test`, { outcome: "succeeded" }, buyer);
    expect((await grantsOf(recipient))[0]!.ends_at!.getTime() - before!.getTime()).toBe(180 * DAY);
    await expect(commerce.service.checkout(buyer, "m1", email.slice(1))).rejects.toMatchObject({
      code: "not_found",
    });
  });
  describe("checkout", () => {
    // Each plan must charge its own price and grant its own term; m1 alone would
    // let a wrong m6/m12 price or duration ship unnoticed.
    for (const [plan, amount, months] of [
      ["m1", 49900, 1],
      ["m6", 219000, 6],
      ["m12", 359000, 12],
    ] as const) {
      it(`records a pending ${plan} purchase at its own price`, async () => {
        const buyer = await account();
        const providerId = await startCheckout(buyer, plan);
        expect((await paymentRow(providerId))[0]!).toMatchObject({
          user_id: buyer,
          plan,
          amount,
          kind: "purchase",
          status: "pending",
          recipient_user_id: null,
        });
      });

      it(`grants ${months * 30} days for a paid ${plan} purchase`, async () => {
        const buyer = await account();
        await buy(buyer, plan);
        const grant = (await grantsOf(buyer))[0]!;
        expect(grant.ends_at!.getTime() - grant.starts_at.getTime()).toBe(months * 30 * DAY);
      });
    }
  });

  describe("gifting", () => {
    it("rejects public gifts during the launch", async () => {
      const buyer = await account();
      const recipient = await account();
      const response = await request("gift", { plan: "m1", recipient_user_id: recipient }, buyer);
      expect(response.status).toBe(403);
    });

    it("records the gift payment against the buyer with the recipient named", async () => {
      const buyer = await account();
      const recipient = await account();
      const providerId = await startCheckout(buyer, "m1", recipient);
      expect((await paymentRow(providerId))[0]!).toMatchObject({
        user_id: buyer,
        recipient_user_id: recipient,
        kind: "gift",
        amount: 49900,
      });
    });

    it("credits a paid gift to the recipient", async () => {
      const buyer = await account();
      const recipient = await account();
      await buy(buyer, "m1", recipient);
      expect(await grantsOf(recipient)).toHaveLength(1);
    });

    it("leaves the buyer of a gift without a subscription", async () => {
      const buyer = await account();
      const recipient = await account();
      await buy(buyer, "m1", recipient);
      expect(await grantsOf(buyer)).toHaveLength(0);
    });
  });

  describe("subscription status", () => {
    // One paid subscription is enough for every read below, and paying for it costs a
    // checkout plus a webhook round trip — so it is bought once for the whole group.
    let subscriber = "";
    beforeAll(async () => {
      subscriber = await account();
      await buy(subscriber);
    });

    it("reports an active premium subscription that does not auto-renew", async () => {
      const response = await statusOf(subscriber);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        is_active: true,
        tier: "premium",
        auto_renew: false,
        manage_url: "https://example.test/subscription",
      });
    });

    it("lists the premium benefits", async () => {
      const response = await statusOf(subscriber);
      expect(response.status).toBe(200);
      expect((await response.json()).benefits.length).toBeGreaterThan(0);
    });

    it("reports no subscription for a user who never paid", async () => {
      const stranger = await account();
      const response = await statusOf(stranger);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ is_active: false, tier: null, ends_at: null });
    });
  });

  describe("auto-renew", () => {
    it("turns auto-renew on for an active subscription", async () => {
      const subscriber = await account();
      await buy(subscriber);
      expect((await setAutoRenew(subscriber, true)).status).toBe(200);
      expect(await (await statusOf(subscriber)).json()).toMatchObject({ auto_renew: true });
    });

    // Without an active subscription there is nothing to renew. `setAutoRenew` in
    // application/service.ts raises not_found when `activeSubscription` comes back null —
    // a user who has only ever paid for a gift is in exactly that state.
    it("rejects enabling auto-renew without an active subscription", async () => {
      const buyer = await account();
      const recipient = await account();
      await buy(buyer, "m1", recipient);
      expect((await setAutoRenew(buyer, true)).status).toBe(404);
    });
  });

  describe("payment webhook", () => {
    it("rejects a delivery that carries no signature header", async () => {
      const buyer = await account();
      const provider_payment_id = await startCheckout(buyer, "m1");
      expect(
        (await request("webhook", { provider_payment_id, event: "succeeded" }, undefined, false))
          .status,
      ).toBe(422);
    });

    describe("a payment delivered six times at once, then failed late", () => {
      // The race is the point of this group, and it costs a checkout plus seven webhook
      // round trips, so it is run once and each outcome is then read separately. The late
      // `failed` is part of the shared setup because the original assertions below were
      // all made after it arrived — they say the grant survived it, not merely that the
      // duplicates were deduplicated.
      let buyer = "";
      let providerId = "";
      let duplicateStatuses: number[] = [];
      let lateFailureStatus = 0;
      beforeAll(async () => {
        buyer = await account();
        providerId = await startCheckout(buyer, "m1");
        const body = { provider_payment_id: providerId, event: "succeeded" };
        const responses = await Promise.all(
          Array.from({ length: 6 }, () => request("webhook", body)),
        );
        duplicateStatuses = responses.map((r) => r.status);
        lateFailureStatus = (await request("webhook", { ...body, event: "failed" })).status;
      });

      it("accepts every one of the six concurrent deliveries", () => {
        expect(duplicateStatuses).toEqual(Array(6).fill(200));
      });

      it("accepts the failure that arrives after the payment already succeeded", () => {
        expect(lateFailureStatus).toBe(200);
      });

      it("grants exactly one subscription", async () => {
        expect(await grantsOf(buyer)).toHaveLength(1);
      });

      it("gives that single subscription the plan's full term", async () => {
        const grant = (await grantsOf(buyer))[0]!;
        expect(grant.ends_at!.getTime() - grant.starts_at.getTime()).toBe(30 * DAY);
      });

      it("stores exactly one notification", async () => {
        expect(await noticesOf(buyer)).toHaveLength(1);
      });

      it("pushes exactly one notification", () => {
        expect(pushesTo(buyer)).toHaveLength(1);
      });

      it("leaves the payment succeeded despite the late failure", async () => {
        expect((await paymentRow(providerId))[0]!.status).toBe("succeeded");
      });
    });

    it("accepts a cancellation of a pending payment", async () => {
      const buyer = await account();
      const provider_payment_id = await pendingPayment(buyer);
      expect((await request("webhook", { provider_payment_id, event: "canceled" })).status).toBe(
        200,
      );
    });

    it("marks a cancelled pending payment cancelled", async () => {
      const buyer = await account();
      const providerId = await pendingPayment(buyer);
      await request("webhook", { provider_payment_id: providerId, event: "canceled" });
      expect((await paymentRow(providerId))[0]!.status).toBe("cancelled");
    });

    it("grants nothing for a cancelled payment", async () => {
      const buyer = await account();
      const providerId = await pendingPayment(buyer);
      await request("webhook", { provider_payment_id: providerId, event: "canceled" });
      expect(await grantsOf(buyer)).toHaveLength(0);
    });

    it("accepts an event it does not recognise", async () => {
      const buyer = await account();
      const provider_payment_id = await pendingPayment(buyer);
      expect(
        (await request("webhook", { provider_payment_id, event: "waiting_for_capture" })).status,
      ).toBe(200);
    });

    it("leaves the payment pending for an event it does not recognise", async () => {
      const buyer = await account();
      const providerId = await pendingPayment(buyer);
      await request("webhook", { provider_payment_id: providerId, event: "waiting_for_capture" });
      expect((await paymentRow(providerId))[0]!.status).toBe("pending");
    });
  });

  describe("grant rollback", () => {
    /**
     * Runs `work` while granting a premium subscription is impossible, so the webhook's
     * transaction is forced to fail after it has already written the payment status.
     *
     * The constraint is global to the table, so nothing else may grant while it is in
     * place — the tests below therefore hold it for a single webhook call each, and this
     * group relies on tests in a file running one at a time (vitest's default, with
     * `fileParallelism: false` in vitest.config.ts covering the other files).
     */
    async function whileGrantsAreRejected(work: () => Promise<void>) {
      await db.$client.query(
        "ALTER TABLE subscriptions ADD CONSTRAINT test_reject_grant CHECK (tier <> 'premium') NOT VALID",
      );
      try {
        await work();
      } finally {
        await db.$client.query("ALTER TABLE subscriptions DROP CONSTRAINT test_reject_grant");
      }
    }

    it("fails the webhook when the subscription grant cannot be written", async () => {
      const buyer = await account();
      const provider_payment_id = await pendingPayment(buyer);
      await whileGrantsAreRejected(async () => {
        await expect(
          commerce.service.webhook({ provider_payment_id, event: "succeeded" }),
        ).rejects.toThrow();
      });
    });

    it("leaves the payment pending when the subscription grant fails", async () => {
      const buyer = await account();
      const providerId = await pendingPayment(buyer);
      await whileGrantsAreRejected(async () => {
        await commerce.service
          .webhook({ provider_payment_id: providerId, event: "succeeded" })
          .catch(() => {});
      });
      expect((await paymentRow(providerId))[0]!.status).toBe("pending");
    });

    it("stores no notification when the subscription grant fails", async () => {
      const buyer = await account();
      const providerId = await pendingPayment(buyer);
      await whileGrantsAreRejected(async () => {
        await commerce.service
          .webhook({ provider_payment_id: providerId, event: "succeeded" })
          .catch(() => {});
      });
      expect(await noticesOf(buyer)).toHaveLength(0);
    });
  });

  describe("subscription term", () => {
    /** Gives `user` a subscription that ended ten days ago, and returns that end date. */
    async function expiredTerm(user: string) {
      const past = new Date(Date.now() - 10 * DAY);
      await db.insert(subscriptions).values({
        user_id: user,
        tier: "premium",
        starts_at: new Date(past.getTime() - 30 * DAY),
        ends_at: past,
      });
      return past;
    }

    // An expired term must not be extended from its old end date — that would
    // silently hand out the days that elapsed while the user had no subscription.
    it("opens a second term rather than extending the expired one", async () => {
      const user = await account();
      await expiredTerm(user);
      await buy(user);
      expect(await grantsOf(user)).toHaveLength(2);
    });

    it("starts the renewed term from now rather than from the expired end date", async () => {
      const user = await account();
      const past = await expiredTerm(user);
      await buy(user);
      const fresh = (await grantsOf(user)).find((g) => g.ends_at!.getTime() > Date.now())!;
      expect(fresh.starts_at.getTime()).toBeGreaterThan(past.getTime());
    });

    it("gives the renewed term its full length", async () => {
      const user = await account();
      await expiredTerm(user);
      await buy(user);
      const fresh = (await grantsOf(user)).find((g) => g.ends_at!.getTime() > Date.now())!;
      expect(fresh.ends_at!.getTime() - fresh.starts_at.getTime()).toBe(30 * DAY);
    });
  });

  describe("referrals", () => {
    /**
     * A referrer with one invited user, two paid m1 payments waiting to be delivered, and
     * five racing qualification attempts — all of which land at once.
     *
     * Everything is driven through the service rather than HTTP so the calls really do
     * overlap: `lockGrants` takes an advisory lock per user, and this is what proves the
     * two payments and the referral bonus queue behind it instead of clobbering each other.
     */
    async function racingGrants() {
      const referrer = await account();
      const invited = await account();
      await db.insert(referrals).values({ referrer_id: referrer, referred_user_id: invited });
      const providerIds = [await pendingPayment(referrer), await pendingPayment(referrer)];
      await Promise.all([
        ...providerIds.map((provider_payment_id) =>
          commerce.service.webhook({ provider_payment_id, event: "succeeded" }),
        ),
        ...Array.from({ length: 5 }, () => commerce.service.qualify(invited)),
      ]);
      return referrer;
    }

    it("sums two concurrent payments and one referral bonus into a single term", async () => {
      const referrer = await racingGrants();
      const grants = await grantsOf(referrer);
      expect(grants).toHaveLength(1);
      expect(grants[0]!.ends_at!.getTime() - grants[0]!.starts_at.getTime()).toBe(67 * DAY);
    });

    it("stores one notification per grant when payments and a bonus race", async () => {
      const referrer = await racingGrants();
      expect(await noticesOf(referrer)).toHaveLength(3);
    });

    it("counts a qualified invitee once however often qualification is retried", async () => {
      const referrer = await racingGrants();
      const info = await referralInfo(referrer);
      expect(info.status).toBe(200);
      expect(await info.json()).toMatchObject({
        invited_count: 1,
        active_count: 1,
        earned_days: 7,
      });
    });

    it("reports an empty tally for a user who has invited nobody", async () => {
      const user = await account();
      const info = await referralInfo(user);
      expect(info.status).toBe(200);
      expect(await info.json()).toMatchObject({
        invited_count: 0,
        active_count: 0,
        earned_days: 0,
      });
    });

    it("builds the invite link from the configured base URL", async () => {
      const user = await account();
      const info = await (await referralInfo(user)).json();
      expect(info.link).toMatch(/^https:\/\/example\.test\/invite\/.+/);
    });
  });
});
