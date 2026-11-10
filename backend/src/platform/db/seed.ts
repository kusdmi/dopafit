import { splitName } from "../../modules/auth/domain/rules.js";
import { pathToFileURL } from "node:url";
import { and, eq, isNull, sql } from "drizzle-orm";
import { createDatabase, type Database } from "./index.js";
import { loadConfig } from "../../config.js";
import { CryptoSecurity } from "../../modules/auth/infrastructure/security.js";
import * as schema from "./schema.js";
import {
  catalogCategories,
  catalogExercises,
  catalogEmbeds,
  standardPrograms,
} from "./seed-data.js";

export async function seedCatalog(db: Database): Promise<void> {
  await db.transaction(async (tx) => {
    // A single transaction also makes overlapping startup/CLI runs idempotent.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('catalog-seed', 0))`);
    for (const category of catalogCategories) {
      await tx
        .insert(schema.exercise_categories)
        .values(category)
        .onConflictDoNothing({ target: schema.exercise_categories.slug });
    }
    const categories = new Map(
      (await tx.select().from(schema.exercise_categories)).map((c) => [c.slug, c.id]),
    );
    // Private exercises with the same names never substitute for global seed data.
    const exercises = new Map(
      (await tx.select().from(schema.exercises).where(isNull(schema.exercises.owner_id))).map(
        (e) => [e.name, e],
      ),
    );
    for (const { category, ...exercise } of catalogExercises) {
      if (exercises.has(exercise.name)) continue;
      const categoryId = categories.get(category);
      if (!categoryId) throw new Error(`Missing seed category: ${category}`);
      const [inserted] = await tx
        .insert(schema.exercises)
        .values({ ...exercise, category_id: categoryId })
        .returning();
      exercises.set(inserted.name, inserted);
    }
    for (const embed of catalogEmbeds) {
      const exercise = exercises.get(embed.exercise);
      if (!exercise || exercise.deleted_at) continue;
      const existing = await tx
        .select({ id: schema.exercise_media.id })
        .from(schema.exercise_media)
        .where(eq(schema.exercise_media.exercise_id, exercise.id))
        .limit(1);
      if (existing.length) continue;
      await tx
        .insert(schema.exercise_media)
        .values({ exercise_id: exercise.id, kind: "iframe", url: embed.url, position: 0 });
    }
    for (const program of standardPrograms) {
      const existing = await tx
        .select({ id: schema.programs.id })
        .from(schema.programs)
        .where(and(isNull(schema.programs.owner_id), eq(schema.programs.name, program.name)))
        .limit(1);
      if (existing.length) continue;
      const [created] = await tx
        .insert(schema.programs)
        .values({ name: program.name, kind: program.kind })
        .returning({ id: schema.programs.id });
      for (const [position, day] of program.days.entries()) {
        const [createdDay] = await tx
          .insert(schema.program_days)
          .values({ program_id: created.id, name: day.name, position })
          .returning({ id: schema.program_days.id });
        for (const [slotPosition, [name, sets, reps]] of day.exercises.entries()) {
          const exercise = exercises.get(name);
          if (!exercise || exercise.deleted_at) continue;
          const [slot] = await tx
            .insert(schema.program_slots)
            .values({ day_id: createdDay.id, position: slotPosition })
            .returning({ id: schema.program_slots.id });
          await tx
            .insert(schema.program_slot_exercises)
            .values({ slot_id: slot.id, exercise_id: exercise.id, sets, reps, variant_order: 0 });
        }
      }
    }
  });
}

/** Password shared by both demo accounts. Development convenience only. */
export const demoPassword = "Dopafit1Demo";

const demoUsers = [
  { phone: "+79990000001", email: "client@dopafit.dev", role: "client", full_name: "Демо Клиент" },
  {
    phone: "+79990000002",
    email: "trainer@dopafit.dev",
    role: "trainer",
    full_name: "Демо Тренер",
  },
] as const;

/**
 * Ready-to-use accounts so a fresh development database can be signed into without
 * going through registration. Never run against production: these are published
 * credentials. Idempotent by email, so repeated runs neither duplicate nor reset
 * accounts a developer has since modified.
 */
export async function seedDemoUsers(
  db: Database,
  security: Pick<CryptoSecurity, "hashPassword" | "referralCode">,
): Promise<void> {
  const passwordHash = await security.hashPassword(demoPassword);
  for (const demo of demoUsers) {
    await db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.email, demo.email))
        .limit(1);
      if (existing.length) return;
      const [user] = await tx
        .insert(schema.users)
        .values({
          email: demo.email,
          phone: demo.phone,
          role: demo.role,
          password_hash: passwordHash,
          referral_code: security.referralCode(),
          email_verified: true,
          phone_verified: true,
          login_method: "password",
          personal_data_consent_at: new Date(),
        })
        .returning({ id: schema.users.id });
      await tx
        .insert(schema.user_profiles)
        .values({ user_id: user.id, full_name: demo.full_name, ...splitName(demo.full_name) });
      await tx.insert(schema.user_settings).values({ user_id: user.id });
    });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url = process.env.DOPAFIT_DATABASE_URL;
  if (!url) throw new Error("DOPAFIT_DATABASE_URL is required");
  const config = loadConfig();
  const db = createDatabase(url, process.env.DOPAFIT_DATABASE_SSL_ROOT_CERT);
  try {
    await seedCatalog(db);
    console.info("Exercise catalog and standard programs seeded");
    if (config.production) {
      console.info("Production environment: demo accounts skipped");
    } else {
      await seedDemoUsers(db, new CryptoSecurity(config.jwtSecret));
      console.info(
        `Demo accounts seeded: ${demoUsers.map((u) => u.email).join(", ")} (password: ${demoPassword})`,
      );
    }
  } finally {
    await db.$client.end();
  }
}
