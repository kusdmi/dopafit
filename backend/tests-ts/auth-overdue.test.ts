import { afterAll, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDatabase } from "./database.js";
import { createAuthModule } from "../src/modules/auth/index.js";
import {
  users,
  user_profiles,
  measurements,
  measurement_photos,
  verification_codes,
  refresh_tokens,
  push_tokens,
  managed_clients,
} from "../src/platform/db/schema.js";
const { db, dispose } = await createTestDatabase();
const now = new Date("2026-09-12T12:00:00Z");
const deleted: string[] = [];
const auth = createAuthModule(db, {
  jwtSecret: "overdue-tests-secret",
  now: () => now,
  sender: {
    async sendVerificationCode() {},
  },
  deleteObject: async (key) => {
    deleted.push(key);
  },
});
afterAll(dispose);
it("rechecks deadline and verification under lock, anonymizes once and cleans private data", async () => {
  const [expired, verified, future] = await db
    .insert(users)
    .values([
      {
        email: "expired@example.com",
        role: "trainer",
        referral_code: "EXPIRED",
        verification_deadline_at: new Date("2026-09-11"),
        password_hash: "old",
      },
      {
        email: "verified@example.com",
        role: "client",
        referral_code: "VERIFIED",
        email_verified: true,
        verification_deadline_at: new Date("2026-09-11"),
      },
      {
        email: "future@example.com",
        role: "client",
        referral_code: "FUTURE",
        verification_deadline_at: new Date("2026-09-13"),
      },
    ])
    .returning();
  await db.insert(user_profiles).values({
    user_id: expired!.id,
    full_name: "Private name",
    city: "Private city",
  });
  const [measurement] = await db
    .insert(measurements)
    .values({ user_id: expired!.id, date: "2026-09-12" })
    .returning();
  await db.insert(measurement_photos).values({
    measurement_id: measurement!.id,
    kind: "front",
    object_key: "expired/private.jpg",
  });
  await db.insert(verification_codes).values({
    user_id: expired!.id,
    contact: "pending@example.com",
    purpose: "change_email",
    code_hash: "code",
    expires_at: new Date("2026-09-13"),
  });
  await db.insert(refresh_tokens).values({
    user_id: expired!.id,
    token_hash: "token",
    expires_at: new Date("2026-10-01"),
  });
  await db.insert(push_tokens).values({ user_id: expired!.id, token: "push", platform: "web" });
  await db
    .insert(managed_clients)
    .values({ owner_id: expired!.id, display_name: "Private client" });
  expect(await auth.application.anonymizeOverdue(verified!.id)).toBe(false);
  expect(await auth.application.anonymizeOverdue(future!.id)).toBe(false);
  const outcomes = await Promise.all([
    auth.application.anonymizeOverdue(expired!.id),
    auth.application.anonymizeOverdue(expired!.id),
  ]);
  expect(outcomes.sort()).toEqual([false, true]);
  expect((await db.select().from(users).where(eq(users.id, expired!.id)))[0]).toMatchObject({
    email: null,
    password_hash: null,
    is_active: false,
    deactivation_reason: "unverified_email",
  });
  expect(deleted).toEqual(["expired/private.jpg"]);
  expect(await db.select().from(verification_codes)).toHaveLength(0);
  expect(await db.select().from(refresh_tokens)).toHaveLength(0);
  expect(await db.select().from(push_tokens)).toHaveLength(0);
  expect(await db.select().from(managed_clients)).toHaveLength(0);
});
