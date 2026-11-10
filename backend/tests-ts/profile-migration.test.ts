import { readFile } from "node:fs/promises";
import { afterAll, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createTestDatabase } from "./database.js";
import { user_profiles, users } from "../src/platform/db/schema.js";
const { db, dispose } = await createTestDatabase();
afterAll(dispose);
it("splits historical names by the migration rules without changing full_name", async () => {
  const examples = [
    ["Анна", "Анна", null, null],
    ["Анна Иванова", "Анна", "Иванова", null],
    ["Иванова Анна Петровна", "Анна", "Иванова", "Петровна"],
    ["Иванова Анна Петровна Мария", "Анна", "Иванова", "Петровна Мария"],
  ];
  const ids: string[] = [];
  for (const [name] of examples) {
    const id = crypto.randomUUID();
    ids.push(id);
    await db.insert(users).values({ id, role: "client", referral_code: id.slice(0, 16) });
    await db.insert(user_profiles).values({ user_id: id, full_name: name! });
  }
  const migration = await readFile(
    new URL("../drizzle/0002_premium_madame_masque.sql", import.meta.url),
    "utf8",
  );
  const statement = migration
    .split("--> statement-breakpoint")
    .find((s) => s.includes("WITH names AS"))!;
  await db.execute(sql.raw(statement));
  for (let i = 0; i < ids.length; i++) {
    const [original, first, last, middle] = examples[i];
    const [profile] = await db
      .select()
      .from(user_profiles)
      .where(eq(user_profiles.user_id, ids[i]));
    expect(profile).toMatchObject({
      full_name: original,
      first_name: first,
      last_name: last,
      middle_name: middle,
    });
  }
});
