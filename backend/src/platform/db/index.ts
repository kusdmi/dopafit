import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";

export type Database = NodePgDatabase<typeof schema>;

export function createDatabase(connectionString: string, rootCertificatePath?: string) {
  const pool = new Pool({
    connectionString,
    max: 10,
    ...(rootCertificatePath
      ? { ssl: { ca: readFileSync(rootCertificatePath, "utf8"), rejectUnauthorized: true } }
      : {}),
  });
  return drizzle(pool, { schema });
}
