import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, isNull } from "drizzle-orm";
import { createTestDatabase } from "./database.js";
import { seedCatalog, seedDemoUsers, demoPassword } from "../src/platform/db/seed.js";
import { CryptoSecurity } from "../src/modules/auth/infrastructure/security.js";
import * as schema from "../src/platform/db/schema.js";

type TestEnvironment = Awaited<ReturnType<typeof createTestDatabase>>;

/**
 * Each describe owns its database. seedCatalog and seedDemoUsers are idempotent but
 * destructive to assert against: the curation tests soft-delete and rename rows, so
 * sharing one database would make every later expectation depend on run order.
 */
function withSeededCatalog(): () => TestEnvironment["db"] {
  let environment: TestEnvironment;
  beforeAll(async () => {
    environment = await createTestDatabase();
    await seedCatalog(environment.db);
  });
  afterAll(async () => {
    await environment?.dispose();
  });
  return () => environment.db;
}

describe("catalog seed contents", () => {
  const db = withSeededCatalog();

  it("creates every exercise category", async () => {
    expect(await db().select().from(schema.exercise_categories)).toHaveLength(6);
  });

  it("creates every catalog exercise", async () => {
    expect(await db().select().from(schema.exercises)).toHaveLength(12);
  });

  it("creates every standard program", async () => {
    expect(await db().select().from(schema.programs)).toHaveLength(4);
  });

  it("creates a day for each program day definition", async () => {
    expect(await db().select().from(schema.program_days)).toHaveLength(5);
  });

  it("creates a slot for each exercise listed in a program day", async () => {
    expect(await db().select().from(schema.program_slots)).toHaveLength(11);
  });

  it("creates one exercise variant per slot", async () => {
    expect(await db().select().from(schema.program_slot_exercises)).toHaveLength(11);
  });

  it("attaches the embedded media of the catalog", async () => {
    expect(await db().select().from(schema.exercise_media)).toHaveLength(1);
  });

  it("creates no user accounts", async () => {
    expect(await db().select().from(schema.users)).toHaveLength(0);
  });

  it("owns every seeded exercise globally rather than per user", async () => {
    expect(
      await db().select().from(schema.exercises).where(isNull(schema.exercises.owner_id)),
    ).toHaveLength(12);
  });
});

describe("repeated and concurrent catalog seeding", () => {
  const db = withSeededCatalog();

  it("preserves exercise ids across overlapping runs", async () => {
    const before = await db().select().from(schema.exercises);
    await Promise.all([seedCatalog(db()), seedCatalog(db())]);
    expect(await db().select().from(schema.exercises)).toEqual(before);
  });

  it("preserves program ids across overlapping runs", async () => {
    const before = await db().select().from(schema.programs);
    await Promise.all([seedCatalog(db()), seedCatalog(db())]);
    expect(await db().select().from(schema.programs)).toEqual(before);
  });

  it("preserves program slot variants across overlapping runs", async () => {
    const before = await db().select().from(schema.program_slot_exercises);
    await Promise.all([seedCatalog(db()), seedCatalog(db())]);
    expect(await db().select().from(schema.program_slot_exercises)).toEqual(before);
  });
});

describe("catalog seeding over an admin-curated exercise", () => {
  const db = withSeededCatalog();
  let curatedId: string;

  // Curate and soft-delete one exercise, then reseed: a later seed must treat the row
  // as already present (matched by name) instead of restoring the original values.
  beforeAll(async () => {
    const [first] = await db().select().from(schema.exercises);
    curatedId = first.id;
    await db()
      .update(schema.exercises)
      .set({ description: "Curated", deleted_at: new Date() })
      .where(eq(schema.exercises.id, curatedId));
    await seedCatalog(db());
  });

  const curated = async () =>
    (await db().select().from(schema.exercises).where(eq(schema.exercises.id, curatedId)))[0];

  it("keeps an edited description", async () => {
    expect((await curated()).description).toBe("Curated");
  });

  it("keeps an intentional removal soft-deleted", async () => {
    expect((await curated()).deleted_at).not.toBeNull();
  });

  it("does not reinsert a soft-deleted exercise under a duplicate name", async () => {
    expect(
      await db().select().from(schema.exercises).where(isNull(schema.exercises.owner_id)),
    ).toHaveLength(12);
  });
});

describe("demo user seeding", () => {
  let environment: TestEnvironment;
  const security = new CryptoSecurity("seed-test-secret-0000000000000000000000");
  const db = () => environment.db;

  beforeAll(async () => {
    environment = await createTestDatabase();
    await seedDemoUsers(environment.db, security);
  });
  afterAll(async () => {
    await environment?.dispose();
  });

  const client = async () =>
    (await db().select().from(schema.users).where(eq(schema.users.email, "client@dopafit.dev")))[0];

  it("creates one account per demo email", async () => {
    const seeded = await db().select().from(schema.users);
    expect(seeded.map((u) => u.email).sort()).toEqual([
      "client@dopafit.dev",
      "trainer@dopafit.dev",
    ]);
  });

  it("gives the demo client the client role", async () => {
    expect((await client()).role).toBe("client");
  });

  // Verified and password-based, so the demo account signs in without a code.
  it("marks the demo client email as verified", async () => {
    expect((await client()).email_verified).toBe(true);
  });

  it("sets the demo client to password login", async () => {
    expect((await client()).login_method).toBe("password");
  });

  it("stores a password hash matching the published demo password", async () => {
    expect(await security.verifyPassword(demoPassword, (await client()).password_hash!)).toBe(true);
  });

  it("creates a profile for each demo account", async () => {
    expect(await db().select().from(schema.user_profiles)).toHaveLength(2);
  });

  it("creates settings for each demo account", async () => {
    expect(await db().select().from(schema.user_settings)).toHaveLength(2);
  });
});

describe("demo user seeding over a locally edited account", () => {
  let environment: TestEnvironment;
  const security = new CryptoSecurity("seed-test-secret-0000000000000000000000");
  const db = () => environment.db;
  let clientId: string;

  // Edit a seeded account, then reseed: matching is by email, so the existing row is
  // left untouched rather than reset to the demo values.
  beforeAll(async () => {
    environment = await createTestDatabase();
    await seedDemoUsers(environment.db, security);
    clientId = (
      await db().select().from(schema.users).where(eq(schema.users.email, "client@dopafit.dev"))
    )[0].id;
    await db()
      .update(schema.users)
      .set({ phone: "+79995550000" })
      .where(eq(schema.users.id, clientId));
    await seedDemoUsers(db(), security);
  });
  afterAll(async () => {
    await environment?.dispose();
  });

  it("does not duplicate the existing accounts", async () => {
    expect(await db().select().from(schema.users)).toHaveLength(2);
  });

  it("keeps the locally edited phone number", async () => {
    expect(
      (await db().select().from(schema.users).where(eq(schema.users.id, clientId)))[0].phone,
    ).toBe("+79995550000");
  });
});
