import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "./index.js";

const url = process.env.DOPAFIT_DATABASE_URL;
if (!url) throw new Error("DOPAFIT_DATABASE_URL is required");
const db = createDatabase(url, process.env.DOPAFIT_DATABASE_SSL_ROOT_CERT);
try {
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL("../../../drizzle/", import.meta.url)),
  });
} finally {
  await db.$client.end();
}
