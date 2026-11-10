import { sql } from "drizzle-orm";
import type { MeasurementRepository } from "../domain/ports.js";
import * as M from "../domain/models/index.js";
import { insert, one, rows, update, type Executor } from "./sql.js";

const projection = sql`m.id,m.user_id,m.date,m.updated_at,m.custom_values,${sql.join(
  M.measurementFields.map(
    (f) => sql`${sql.identifier("m")}.${sql.identifier(f)}::float8 ${sql.identifier(f)}`,
  ),
  sql`,`,
)}`;
function values(input: M.MeasurementDraft) {
  return {
    ...Object.fromEntries(M.measurementFields.map((f) => [f, input[f]])),
    date: input.date,
    custom_values: JSON.stringify(input.custom_values),
  };
}
export class PgMeasurementRepository implements MeasurementRepository {
  constructor(private readonly db: Executor) {}
  async available(user: string) {
    const flags = await one<Record<M.MeasurementField, boolean>>(
      this.db,
      sql`select ${sql.join(
        M.measurementFields.map(
          (f) =>
            sql`coalesce(bool_or(${sql.identifier(f)} is not null),false) ${sql.identifier(f)}`,
        ),
        sql`,`,
      )} from measurements where user_id=${user}`,
    );
    const slots = await rows<{ slot: number }>(
      this.db,
      sql`select distinct (v->>'slot')::int slot from measurements m cross join lateral jsonb_array_elements(m.custom_values) v where m.user_id=${user} and v->>'value' is not null order by slot`,
    );
    return {
      parameters: M.measurementFields.filter((f) => flags?.[f]),
      custom_slots: slots.map((s) => s.slot),
    };
  }
  get(id: string) {
    return one<M.Measurement>(
      this.db,
      sql`select ${projection} from measurements m where id=${id}`,
    );
  }
  byDate(user: string, date: string) {
    return one<M.Measurement>(
      this.db,
      sql`select ${projection} from measurements m where user_id=${user} and date=${date}`,
    );
  }
  async list(user: string, _card: string | null, limit: number, offset: number) {
    const predicate = sql`m.user_id=${user}`;
    const items = await rows<M.Measurement>(
      this.db,
      sql`select ${projection} from measurements m where ${predicate} order by m.date desc,m.id limit ${limit} offset ${offset}`,
    );
    const total = (await one<{ count: number }>(
      this.db,
      sql`select count(*)::int count from measurements m where ${predicate}`,
    ))!.count;
    return { items, total };
  }
  create(user: string, input: M.MeasurementDraft) {
    return insert(this.db, "measurements", {
      ...values(input),
      id: input.id ?? crypto.randomUUID(),
      user_id: user,
      created_by_user_id: user,
    });
  }
  async update(id: string, input: M.MeasurementDraft) {
    await update(this.db, "measurements", id, values(input));
  }
  async remove(id: string) {
    await this.db.execute(sql`delete from measurements where id=${id}`);
  }
  fields(user: string) {
    return rows<M.CustomField>(
      this.db,
      sql`select slot,name,unit from custom_measurement_fields where user_id=${user} order by slot`,
    );
  }
  async setField(user: string, input: M.CustomField) {
    await insert(
      this.db,
      "custom_measurement_fields",
      { user_id: user, ...input },
      sql`on conflict(user_id,slot) do update set name=excluded.name,unit=excluded.unit,updated_at=now()`,
    );
  }
  photos(id: string) {
    return rows<M.Photo>(
      this.db,
      sql`select measurement_id,kind,object_key from measurement_photos where measurement_id=${id} order by kind`,
    );
  }
  async setPhoto(id: string, kind: M.PhotoKind, key: string) {
    await insert(
      this.db,
      "measurement_photos",
      { measurement_id: id, kind, object_key: key },
      sql`on conflict(measurement_id,kind) do update set object_key=excluded.object_key,updated_at=now()`,
    );
  }
  async removePhoto(id: string, kind: M.PhotoKind) {
    await this.db.execute(
      sql`delete from measurement_photos where measurement_id=${id} and kind=${kind}`,
    );
  }
  photoDates(user: string, kind: M.PhotoKind) {
    return rows<M.Photo>(
      this.db,
      sql`select p.measurement_id,p.kind,p.object_key,m.date from measurement_photos p join measurements m on m.id=p.measurement_id where m.user_id=${user} and p.kind=${kind} order by m.date`,
    );
  }
  async points(
    user: string,
    _card: string | null,
    field: M.MeasurementField | number,
    from: string,
    to: string,
  ) {
    const predicate = sql`m.user_id=${user} and m.date>=${from} and m.date<=${to}`;
    if (typeof field === "number") {
      const entries = await rows<{ date: string; custom_values: M.CustomValue[] }>(
        this.db,
        sql`select m.date,m.custom_values from measurements m where ${predicate} order by m.date`,
      );
      return entries.flatMap((m) => {
        const value = m.custom_values.find((v) => v.slot === field)?.value;
        return value == null ? [] : [{ date: m.date, value }];
      });
    }
    return rows<M.Point>(
      this.db,
      sql`select m.date,${sql.identifier(field)}::float8 value from measurements m where ${predicate} and ${sql.identifier(field)} is not null order by m.date`,
    );
  }
}
