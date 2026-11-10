import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "../src/platform/db/index.js";

export async function createTestDatabase() {
  const url = new URL(
    process.env.DOPAFIT_TEST_DATABASE_URL ??
      "postgresql://dopafit:dopafit@postgres:5432/dopafit_hono_test",
  );
  const name = `dopafit_test_${randomUUID().replaceAll("-", "")}`;
  url.pathname = "/postgres";
  const admin = new Pool({ connectionString: url.toString(), max: 1 });
  await admin.query(`CREATE DATABASE "${name}"`);
  url.pathname = `/${name}`;
  const db = createDatabase(url.toString());
  const dispose = async () => {
    await db.$client.end();
    try {
      await admin.query(`DROP DATABASE "${name}"`);
    } finally {
      await admin.end();
    }
  };
  try {
    await migrate(db, { migrationsFolder: fileURLToPath(new URL("../drizzle/", import.meta.url)) });
  } catch (error) {
    await dispose();
    throw error;
  }
  return { db, dispose };
}
