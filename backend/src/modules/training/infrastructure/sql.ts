import { sql, type SQL } from "drizzle-orm";
import type { Database } from "../../../platform/db/index.js";

export type Executor = Pick<Database, "execute">;
function normalize(value: unknown, key = ""): unknown {
  if (typeof value === "string" && key.endsWith("_at")) return new Date(value).toISOString();
  if (value instanceof Date)
    return ["date", "local_date", "start_date", "end_date"].includes(key)
      ? value.toISOString().slice(0, 10)
      : value.toISOString();
  if (Array.isArray(value)) return value.map((item) => normalize(item));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalize(item, key)]),
    );
  return value;
}
export async function rows<T>(db: Executor, query: SQL): Promise<T[]> {
  const result = await db.execute(query);
  return normalize(result.rows) as T[];
}
export async function one<T>(db: Executor, query: SQL): Promise<T | null> {
  return (await rows<T>(db, query))[0] ?? null;
}
export async function insert(
  db: Executor,
  table: string,
  values: object,
  suffix: SQL = sql``,
): Promise<string> {
  const data = { id: crypto.randomUUID(), ...values };
  const entries = Object.entries(data);
  const result = await one<{ id: string }>(
    db,
    sql`insert into ${sql.identifier(table)} (${sql.join(
      entries.map(([k]) => sql.identifier(k)),
      sql`, `,
    )}) values (${sql.join(
      entries.map(([, v]) => sql`${v}`),
      sql`, `,
    )}) ${suffix} returning id`,
  );
  return result?.id ?? data.id;
}
export async function update(
  db: Executor,
  table: string,
  id: string,
  values: object,
): Promise<void> {
  const entries = Object.entries({ ...values, updated_at: new Date().toISOString() }).filter(
    ([, v]) => v !== undefined,
  );
  await db.execute(
    sql`update ${sql.identifier(table)} set ${sql.join(
      entries.map(([k, v]) => sql`${sql.identifier(k)}=${v}`),
      sql`, `,
    )} where id=${id}`,
  );
}
export const timestampPeriod = (card: string | SQL, column: SQL): SQL =>
  sql`exists(select 1 from trainer_client_periods p where p.trainer_client_id=${card} and p.start_date<=${column} and (p.end_date is null or p.end_date>${column}))`;
export const datePeriod = (card: string, column: SQL): SQL =>
  sql`exists(select 1 from trainer_client_periods p where p.trainer_client_id=${card} and (p.start_date at time zone 'UTC')::date<=${column} and (p.end_date is null or (p.end_date at time zone 'UTC')::date>=${column}))`;
