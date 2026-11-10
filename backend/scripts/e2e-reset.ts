import { fileURLToPath, pathToFileURL } from "node:url";
import { Pool } from "pg";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { loadConfig } from "../src/config.js";
import { createDatabase } from "../src/platform/db/index.js";
import { seedCatalog, seedDemoUsers } from "../src/platform/db/seed.js";
import { exercise_categories, exercises } from "../src/platform/db/schema.js";
import { CryptoSecurity } from "../src/modules/auth/infrastructure/security.js";

/**
 * Drops and rebuilds the database the e2e stand runs against.
 *
 * It exists because the stand needs a known state BEFORE `backend-e2e` starts,
 * and `createTestDatabase()` cannot provide that: it reconnects drizzle inside the
 * test process, while here the database has to be ready for an already running
 * container. `migrate.ts` is no substitute either — it requires the database to
 * exist, and dropping it is the point.
 *
 * Reset is destructive by design, which is why the production guard below throws
 * instead of skipping the way the seed CLI does: a soft skip would leave the
 * caller believing a reset happened.
 */
export async function resetE2eDatabase(databaseUrl: string): Promise<void> {
  const config = loadConfig();
  if (config.production) {
    throw new Error("Refusing to reset an e2e database in a production environment");
  }

  const url = new URL(databaseUrl);
  const name = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!name) throw new Error(`No database name in the connection URL: ${url.host}`);
  // The reset must not target the development database a developer is working in.
  if (!name.endsWith("_e2e")) {
    throw new Error(`Refusing to reset "${name}": an e2e database name must end with _e2e`);
  }

  // DROP/CREATE DATABASE cannot run inside the database being dropped, so the
  // admin connection goes to the always-present "postgres" database.
  const adminUrl = new URL(url.toString());
  adminUrl.pathname = "/postgres";
  const admin = new Pool({ connectionString: adminUrl.toString(), max: 1 });
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.end();
  }

  const db = createDatabase(url.toString());
  try {
    await migrate(db, {
      migrationsFolder: fileURLToPath(new URL("../drizzle/", import.meta.url)),
    });
    await seedCatalog(db);
    // A larger read-only fixture exercises pagination without changing user quotas.
    // This runs only after the production and _e2e database guards above.
    const [category] = await db
      .select({ id: exercise_categories.id })
      .from(exercise_categories)
      .limit(1);
    if (!category) throw new Error("Missing e2e exercise category");
    await db.insert(exercises).values(
      Array.from({ length: 100 }, (_, index) => ({
        name: `Каталог E2E ${String(index).padStart(3, "0")}`,
        category_id: category.id,
        difficulty: "beginner" as const,
      })),
    );
    await seedDemoUsers(db, new CryptoSecurity(config.jwtSecret));
  } finally {
    await db.$client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const databaseUrl = process.argv[2] ?? process.env.DOPAFIT_DATABASE_URL;
  if (!databaseUrl) throw new Error("DOPAFIT_DATABASE_URL is required");
  await resetE2eDatabase(databaseUrl);
  console.info("E2E database reset: migrated, catalog and demo accounts seeded");
}
