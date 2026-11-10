import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDatabase } from "./database.js";
import { createMessagingModule } from "../src/modules/messaging/index.js";
import { messagingEndpoints } from "../src/modules/messaging/http/endpoints.js";
import { createApi } from "../src/http/app.js";

import {
  users,
  notifications,
  notification_settings,
  push_tokens,
  scheduler_runs,
  verification_codes,
  refresh_tokens,
} from "../src/platform/db/schema.js";
const { db, dispose } = await createTestDatabase();
const [first, second] = await db
  .insert(users)
  .values([
    { email: "first@example.com", role: "client", referral_code: "FIRST" },
    { email: "second@example.com", role: "client", referral_code: "SECOND" },
  ])
  .returning();
/**
 * What the fake push provider and the anonymization hook recorded.
 *
 * Both are module-level because the module under test is built once for the whole file, so
 * the callbacks that fill them are wired in before any test runs. The `beforeEach` below
 * empties them again, which is what lets each test assert an exact count: without it the
 * numbers depend on which tests ran first, and `--sequence.shuffle` turns the absolute
 * assertions below into false failures.
 */
const delivered: { token: string; title: string; data?: Record<string, unknown> | null }[] = [];
const erased: string[] = [];
const now = new Date("2026-09-09T12:00:00Z");
const module = createMessagingModule(db, {
  now: () => now,
  pushProvider: {
    async send(input) {
      delivered.push(input);
      return input.token !== "stale";
    },
  },
  anonymizeOverdue: async (id) => {
    erased.push(id);
    await db.update(users).set({ is_active: false }).where(eq(users.id, id));
    return true;
  },
});
const api = createApi({
  endpoints: messagingEndpoints(module.application),
  authenticate: async (token) => ({ id: token, role: "client" }),
});
async function request(method: string, path: string, body?: unknown, id = first!.id) {
  return api.request(`/api/v1${path}`, {
    method,
    headers: {
      authorization: `Bearer ${id}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
beforeEach(() => {
  delivered.length = 0;
  erased.length = 0;
});
afterAll(dispose);
describe("messaging HTTP and delivery", () => {
  it("keeps notification reads and read updates scoped to the current user", async () => {
    const rows = await db
      .insert(notifications)
      .values([
        { user_id: first!.id, type: "account", title: "A", body: "first" },
        { user_id: second!.id, type: "account", title: "B", body: "second" },
      ])
      .returning();
    const list = await request("GET", "/notifications?limit=1&offset=0");
    expect(list.status).toBe(200);
    expect(await list.json()).toMatchObject({
      total: 1,
      unread: 1,
      items: [{ body: "first" }],
    });
    expect(
      (
        await request("POST", "/notifications/read", {
          notification_ids: [rows[1]!.id],
        })
      ).status,
    ).toBe(200);
    expect(
      (await db.select().from(notifications).where(eq(notifications.id, rows[1]!.id)))[0]?.is_read,
    ).toBe(false);
    expect((await request("POST", "/notifications/read-all")).status).toBe(200);
    expect((await request("GET", "/notifications")).status).toBe(200);
    expect((await (await request("GET", "/notifications")).json()).unread).toBe(0);
  });
  it("gates delivery without creating settings and transfers/evicts tokens safely", async () => {
    expect(
      (
        await request("POST", "/notifications/push-token", {
          token: "device",
          platform: "web",
          keys: { p256dh: "key", auth: "secret" },
        })
      ).status,
    ).toBe(200);
    await module.push.deliver({
      userId: first!.id,
      type: "system",
      title: "hidden",
      body: "default gate",
    });
    expect(delivered).toHaveLength(0);
    expect(await db.select().from(notification_settings)).toHaveLength(0);
    await module.push.deliver({
      userId: first!.id,
      type: "support",
      title: "shown",
      body: "transactional",
    });
    expect(delivered).toHaveLength(1);
    const settings = await request("GET", "/notifications/settings");
    expect(await settings.json()).toMatchObject({
      push_enabled: true,
      new_features: false,
    });
    expect(
      (
        await request("PATCH", "/notifications/settings", {
          push_enabled: false,
        })
      ).status,
    ).toBe(200);
    await module.push.deliver({
      userId: first!.id,
      type: "support",
      title: "hidden",
      body: "master gate",
    });
    expect(delivered).toHaveLength(1);
    await request(
      "POST",
      "/notifications/push-token",
      { token: "device", platform: "ios" },
      second!.id,
    );
    expect(
      (await db.select().from(push_tokens).where(eq(push_tokens.token, "device")))[0],
    ).toMatchObject({ user_id: second!.id, p256dh: null, auth: null });
    await request(
      "POST",
      "/notifications/push-token",
      { token: "stale", platform: "ios" },
      second!.id,
    );
    await module.push.deliver({
      userId: second!.id,
      type: "account",
      title: "test",
      body: "delivery",
    });
    expect(await db.select().from(push_tokens).where(eq(push_tokens.token, "stale"))).toHaveLength(
      0,
    );
  });
  it("protects ticket details/replies and reopens a ticket after user reply", async () => {
    const created = await request("POST", "/support/tickets", {
      subject: "Private",
      message: "Private details",
    });
    expect(created.status).toBe(201);
    const ticket = await created.json();
    const list = await request("GET", "/support/tickets", undefined, second!.id);
    expect(await list.json()).toEqual([]);
    expect(
      (await request("GET", `/support/tickets/${ticket.id}`, undefined, second!.id)).status,
    ).toBe(403);
    expect(
      (
        await request(
          "POST",
          `/support/tickets/${ticket.id}/replies`,
          { body: "intruder" },
          second!.id,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request("POST", `/support/tickets/${ticket.id}/replies`, {
          body: "Followup",
        })
      ).status,
    ).toBe(200);
    expect(await (await request("GET", `/support/tickets/${ticket.id}`)).json()).toMatchObject({
      status: "open",
      replies: [{ author: "user", body: "Followup" }],
    });
  });
  it("claims each daily task once across concurrent runners and records cleanup", async () => {
    const [remind, overdue, verified, tooEarly] = await db
      .insert(users)
      .values([
        {
          email: "remind@example.com",
          role: "client",
          referral_code: "REMIND",
          verification_deadline_at: new Date("2026-09-16T01:00:00Z"),
        },
        {
          email: "overdue@example.com",
          role: "client",
          referral_code: "OVERDUE",
          verification_deadline_at: new Date("2026-09-08T01:00:00Z"),
        },
        // Already verified: an expired deadline must never reach anonymization,
        // which would irreversibly erase a legitimate account.
        {
          email: "verified-overdue@example.com",
          role: "client",
          referral_code: "VERIFIED",
          email_verified: true,
          verification_deadline_at: new Date("2026-09-08T01:00:00Z"),
        },
        // Five days out: reminders go at 7/3/1 days only, not every day.
        {
          email: "five-days@example.com",
          role: "client",
          referral_code: "FIVEDAYS",
          verification_deadline_at: new Date("2026-09-14T01:00:00Z"),
        },
      ])
      .returning();
    await db.insert(verification_codes).values({
      contact: "old@example.com",
      purpose: "login",
      code_hash: "old",
      expires_at: new Date("2026-09-08T00:00:00Z"),
    });
    await db.insert(refresh_tokens).values({
      user_id: first!.id,
      token_hash: "old",
      expires_at: new Date("2026-09-08T00:00:00Z"),
    });
    // Live rows that housekeeping must leave alone; pruning these would sign every
    // user out and invalidate codes that are still in flight.
    const liveCode = await db
      .insert(verification_codes)
      .values({
        contact: "live@example.com",
        purpose: "login",
        code_hash: "live",
        expires_at: new Date("2026-09-20T00:00:00Z"),
      })
      .returning();
    const liveToken = await db
      .insert(refresh_tokens)
      .values({
        user_id: first!.id,
        token_hash: "live",
        expires_at: new Date("2026-09-20T00:00:00Z"),
      })
      .returning();
    const runs = await Promise.all([module.jobs.runDueTasks(), module.jobs.runDueTasks()]);
    expect(runs.flat().sort()).toEqual([
      "deactivate_overdue",
      "housekeeping",
      "verification_reminders",
    ]);
    expect(await module.jobs.runDueTasks()).toEqual([]);
    // Scoped to the run date this test claims tasks for, which is the one `now` implies.
    // `scheduler_runs` is the other accumulator shared across the file: the stale-run test
    // writes a 2026-09-08 row and the provider-failure test writes two 2026-09-10 rows, so
    // an unscoped select counts whatever ran first. The count stays exact — three tasks are
    // due on this date and each must be claimed exactly once, concurrent runners included.
    const ledger = await db
      .select()
      .from(scheduler_runs)
      .where(eq(scheduler_runs.run_date, "2026-09-09"));
    expect(ledger).toHaveLength(3);
    expect(ledger.every((x) => x.status === "success")).toBe(true);
    expect(
      (await db.select().from(notifications).where(eq(notifications.user_id, remind!.id)))[0]?.type,
    ).toBe("account");
    // Of the four accounts this test created, only the unverified overdue one is erased.
    // Restricted to those four ids because `deactivate_overdue` sweeps the whole table: the
    // provider-failure test below seeds an overdue account of its own, so under
    // `--sequence.shuffle` an unfiltered `erased` also carries whatever that test left behind.
    const fixtures = [remind!.id, overdue!.id, verified!.id, tooEarly!.id];
    expect(erased.filter((id) => fixtures.includes(id))).toEqual([overdue!.id]);
    expect(erased).not.toContain(verified!.id);
    // The five-day account is outside the 7/3/1 schedule, so it gets no reminder.
    expect(
      await db.select().from(notifications).where(eq(notifications.user_id, tooEarly!.id)),
    ).toHaveLength(0);
    // Housekeeping prunes the dead rows and keeps the live ones.
    expect((await db.select().from(verification_codes)).map((x) => x.id)).toEqual([
      liveCode[0]!.id,
    ]);
    expect((await db.select().from(refresh_tokens)).map((x) => x.id)).toEqual([liveToken[0]!.id]);
  });
  it("marks stale running jobs failed without retrying that day", async () => {
    await db.insert(scheduler_runs).values({
      task_name: "old_task",
      run_date: "2026-09-08",
      status: "running",
      started_at: new Date("2026-09-08T00:00:00Z"),
    });
    expect(await module.jobs.reapStaleRuns()).toBe(1);
    expect(
      (await db.select().from(scheduler_runs).where(eq(scheduler_runs.task_name, "old_task")))[0],
    ).toMatchObject({
      status: "failed",
      detail: "stale: no completion within threshold",
    });
  });
});

it("keeps committed reminders despite provider failures and records failed daily runs without retry", async () => {
  const [reminder, failure] = await db
    .insert(users)
    .values([
      {
        email: "retry-reminder@example.com",
        role: "client",
        referral_code: "RETRYREM",
        verification_deadline_at: new Date("2026-09-16T01:00:00Z"),
      },
      {
        email: "retry-failure@example.com",
        role: "client",
        referral_code: "RETRYFAIL",
        verification_deadline_at: new Date("2026-09-08T01:00:00Z"),
      },
    ])
    .returning();
  await db.insert(push_tokens).values({ user_id: reminder!.id, token: "failing", platform: "ios" });
  const errors: unknown[] = [];
  const failing = createMessagingModule(db, {
    now: () => now,
    onIntegrationError: (error) => {
      errors.push(error);
    },
    pushProvider: {
      async send() {
        throw new Error("Delivery failed");
      },
    },
    anonymizeOverdue: async () => {
      throw new Error("Storage unavailable");
    },
  });
  expect(
    await failing.jobs.runDueTasks({
      runDate: "2026-09-10",
      only: ["verification_reminders", "deactivate_overdue"],
    }),
  ).toEqual(["verification_reminders", "deactivate_overdue"]);
  expect(
    await failing.jobs.runDueTasks({
      runDate: "2026-09-10",
      only: ["deactivate_overdue"],
    }),
  ).toEqual([]);
  expect(
    await db.select().from(notifications).where(eq(notifications.user_id, reminder!.id)),
  ).toHaveLength(1);
  expect((await db.select().from(users).where(eq(users.id, failure!.id)))[0]?.is_active).toBe(true);
  const ledger = await db
    .select()
    .from(scheduler_runs)
    .where(eq(scheduler_runs.run_date, "2026-09-10"));
  expect(ledger.find((x) => x.task_name === "verification_reminders")?.status).toBe("success");
  expect(ledger.find((x) => x.task_name === "deactivate_overdue")).toMatchObject({
    status: "failed",
    detail: "Storage unavailable",
  });
  expect(errors).toHaveLength(2);
});

it("does not evict a stale token after it has transferred to another account during delivery", async () => {
  const [owner, nextOwner] = await db
    .insert(users)
    .values([
      {
        email: "token-owner@example.com",
        role: "client",
        referral_code: "TOKENOWN",
      },
      {
        email: "token-next@example.com",
        role: "client",
        referral_code: "TOKENNEXT",
      },
    ])
    .returning();
  await db
    .insert(push_tokens)
    .values({ user_id: owner!.id, token: "transferred", platform: "web" });
  const transferring = createMessagingModule(db, {
    pushProvider: {
      async send() {
        await db
          .update(push_tokens)
          .set({ user_id: nextOwner!.id })
          .where(eq(push_tokens.token, "transferred"));
        return false;
      },
    },
  });
  await transferring.push.deliver({
    userId: owner!.id,
    type: "support",
    title: "Reply",
    body: "Private",
  });
  expect(
    (await db.select().from(push_tokens).where(eq(push_tokens.token, "transferred")))[0]?.user_id,
  ).toBe(nextOwner!.id);
});

/**
 * Delivery is asserted at the provider boundary rather than on the stored notification: the
 * route is not part of the record, it is part of the message the device receives. What the
 * service worker reads is exactly this `data` (see frontend/src/sw.ts).
 *
 * Its own database and module, because the shared fixture above asserts exact delivery counts
 * and a second recipient registered into it would make those numbers depend on test order.
 */
describe("the screen a push opens", () => {
  const captured: { data?: Record<string, unknown> | null }[] = [];
  let routed: Awaited<ReturnType<typeof createTestDatabase>>;
  let routedModule: ReturnType<typeof createMessagingModule>;
  let recipient: string;

  beforeAll(async () => {
    routed = await createTestDatabase();
    recipient = (
      await routed.db
        .insert(users)
        .values({ email: "routed@example.com", role: "trainer", referral_code: "ROUTED" })
        .returning()
    )[0]!.id;
    await routed.db
      .insert(push_tokens)
      .values({ user_id: recipient, token: "routed-device", platform: "web" });
    routedModule = createMessagingModule(routed.db, {
      pushProvider: {
        async send(input) {
          captured.push(input);
          return true;
        },
      },
    });
  });
  afterAll(async () => routed?.dispose());
  beforeEach(() => {
    captured.length = 0;
  });

  it("carries the connections screen and the requests tab for a link request", async () => {
    await routedModule.push.deliver({
      userId: recipient,
      type: "link_request",
      title: "Клиент хочет к вам присоединиться",
      body: "Откройте запросы, чтобы принять или отклонить.",
      data: { request_id: "req-1" },
    });
    expect(captured).toHaveLength(1);
    expect(captured[0]!.data).toEqual({
      request_id: "req-1",
      url: "/app/settings/connections?tab=requests&request_id=req-1",
    });
  });

  it("passes the notification id through to the device alongside the route", async () => {
    // The tap on a system push must also mark that row read; the service worker knows
    // about the notification only what the payload carries.
    await routedModule.push.deliver({
      userId: recipient,
      type: "link_request",
      title: "Клиент хочет к вам присоединиться",
      body: "Откройте запросы, чтобы принять или отклонить.",
      data: { request_id: "req-2", notification_id: "notif-9" },
    });
    expect(captured[0]!.data).toEqual({
      request_id: "req-2",
      notification_id: "notif-9",
      url: "/app/settings/connections?tab=requests&request_id=req-2",
    });
  });

  it("keeps the route out of a producer's hands", async () => {
    // A producer that sets its own `url` must not be able to aim the device anywhere it
    // likes; the delivery layer owns that decision.
    await routedModule.push.deliver({
      userId: recipient,
      type: "link_request",
      title: "Запрос",
      body: "Текст",
      data: { url: "https://example.com/phish" },
    });
    expect(captured[0]!.data).toEqual({ url: "/app/settings/connections?tab=requests" });
  });

  it("sends no url for a type with no screen answering it", async () => {
    await routedModule.push.deliver({
      userId: recipient,
      type: "support",
      title: "Ответ поддержки",
      body: "Текст",
    });
    expect(captured).toHaveLength(1);
    expect(captured[0]!.data ?? {}).not.toHaveProperty("url");
  });
});
