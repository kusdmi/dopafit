import { sql } from "drizzle-orm";
import type { CatalogRepository } from "../domain/ports.js";
import type * as M from "../domain/models/index.js";
import { insert, one, rows, update, type Executor } from "./sql.js";

/** An `exercise_media` row as the driver hands it over: both columns independently nullable. */
interface MediaRow {
  id: string;
  exercise_id: string;
  kind: M.MediaKind;
  object_key: string | null;
  url: string | null;
  position: number;
}
/**
 * The one place where an `exercise_media` row becomes an `M.Media`, and therefore the one
 * place that has to prove the XOR the domain type claims. `rows<T>` only asserts its type
 * parameter, so without this check the union would be an unchecked promise; here it is a
 * verified one. The database backs the check with
 * `CHECK ((object_key IS NULL) <> (url IS NULL))`, so this throw is unreachable for rows
 * written through the schema — it guards against the constraint being dropped or the table
 * being populated out of band, and replaces the per-call-site null handling that used to
 * live in the application layer.
 */
export function toMedia(row: MediaRow): M.Media {
  const base = { id: row.id, exercise_id: row.exercise_id, kind: row.kind, position: row.position };
  if (row.url !== null && row.object_key === null) return { ...base, url: row.url };
  if (row.object_key !== null && row.url === null) return { ...base, object_key: row.object_key };
  throw new Error(
    `Media ${row.id} violates the object_key/url invariant: exactly one of them must be set`,
  );
}

const visible = (user: string) =>
  sql`e.deleted_at is null and (e.owner_id is null or e.owner_id=${user} or exists(select 1 from exercise_shares s where s.exercise_id=e.id and s.user_id=${user}))`;
const selection = (user: string) =>
  sql`select e.*,exists(select 1 from exercise_favorites f where f.exercise_id=e.id and f.user_id=${user}) is_favorite,exists(select 1 from exercise_shares s where s.exercise_id=e.id and s.user_id=${user}) is_shared from exercises e`;
export class PgCatalogRepository implements CatalogRepository {
  constructor(private readonly db: Executor) {}
  categories(user: string) {
    return rows<M.Category>(
      this.db,
      sql`select c.id,c.name,c.slug,c.emoji,c.image_key image_url,(select count(*)::int from exercises e where e.category_id=c.id and ${visible(user)}) exercise_count from exercise_categories c order by c.position,c.name`,
    );
  }
  async list(
    user: string,
    search: string | null,
    category: string | null,
    favorites: boolean,
    limit: number,
    offset: number,
  ) {
    const filter = sql`${visible(user)} ${search ? sql`and (e.name ilike ${`%${search}%`} or e.alt_names::text ilike ${`%${search}%`})` : sql``} ${category ? sql`and e.category_id=${category}` : sql``} ${favorites ? sql`and exists(select 1 from exercise_favorites f where f.exercise_id=e.id and f.user_id=${user})` : sql``}`;
    const items = await rows<M.Exercise>(
      this.db,
      sql`${selection(user)} where ${filter} order by e.name,e.id limit ${limit} offset ${offset}`,
    );
    const total = (await one<{ total: number }>(
      this.db,
      sql`select count(*)::int total from exercises e where ${filter}`,
    ))!.total;
    return { items, total };
  }
  get(user: string, id: string) {
    return one<M.Exercise>(this.db, sql`${selection(user)} where e.id=${id} and ${visible(user)}`);
  }
  async accessibleExerciseIds(user: string, ids: string[]) {
    if (!ids.length) return [];
    const allowed = await rows<{ id: string }>(
      this.db,
      sql`select e.id from exercises e where e.id in (${sql.join(
        ids.map((id) => sql`${id}`),
        sql`,`,
      )}) and (e.owner_id is null or e.owner_id=${user} or exists(select 1 from exercise_shares s where s.exercise_id=e.id and s.user_id=${user}))`,
    );
    return allowed.map((exercise) => exercise.id);
  }
  async countOwn(user: string) {
    return (await one<{ count: number }>(
      this.db,
      sql`select count(*)::int count from exercises where owner_id=${user} and deleted_at is null`,
    ))!.count;
  }
  create(user: string, input: M.ExerciseDraft) {
    return insert(this.db, "exercises", {
      ...input,
      owner_id: user,
      steps: JSON.stringify(input.steps),
      alt_names: JSON.stringify(input.alt_names),
    });
  }
  async update(id: string, input: Partial<M.ExerciseDraft>) {
    const data = { ...input };
    await update(this.db, "exercises", id, {
      ...data,
      ...(data.steps ? { steps: JSON.stringify(data.steps) } : {}),
      ...(data.alt_names ? { alt_names: JSON.stringify(data.alt_names) } : {}),
    });
  }
  async remove(id: string, now: string) {
    await update(this.db, "exercises", id, { deleted_at: now });
  }
  async favorite(user: string, exercise: string, value: boolean) {
    if (value)
      await insert(
        this.db,
        "exercise_favorites",
        { user_id: user, exercise_id: exercise },
        sql`on conflict(user_id,exercise_id) do nothing`,
      );
    else
      await this.db.execute(
        sql`delete from exercise_favorites where user_id=${user} and exercise_id=${exercise}`,
      );
  }
  async media(id: string) {
    const raw = await rows<MediaRow>(
      this.db,
      sql`select * from exercise_media where exercise_id=${id} order by position,id`,
    );
    return raw.map(toMedia);
  }
  async addMedia(input: M.MediaDraft) {
    const id = await insert(this.db, "exercise_media", input);
    return { ...input, id };
  }
  async removeMedia(id: string) {
    await this.db.execute(sql`delete from exercise_media where id=${id}`);
  }
}
