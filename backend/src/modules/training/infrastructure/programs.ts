import { sql } from "drizzle-orm";
import type { ProgramRepository } from "../domain/ports.js";
import type * as M from "../domain/models/index.js";
import { insert, one, rows, update, type Executor } from "./sql.js";

const variantSelect = sql`select v.*,coalesce(e.name,v.custom_name,'') name,coalesce(length(e.contraindications)>0,false) has_contraindications from program_slot_exercises v left join exercises e on e.id=v.exercise_id`;
export class PgProgramRepository implements ProgramRepository {
  constructor(private readonly db: Executor) {}
  async list(user: string, standard: boolean | null) {
    return rows<M.ProgramListSummary>(
      this.db,
      sql`select p.id,p.owner_id,p.assigned_by,p.name,p.kind,p.updated_at,p.for_trainer_client_id,coalesce(up.full_name,m.display_name) for_client_name,
      (select count(*)::int from program_days d where d.program_id=p.id and d.deleted_at is null) day_count,
      (select count(*)::int from program_slot_exercises v join program_slots s on s.id=v.slot_id join program_days d on d.id=s.day_id where d.program_id=p.id and d.deleted_at is null and s.deleted_at is null and v.deleted_at is null and v.variant_order=0) exercise_count
      from programs p left join trainer_clients c on c.id=p.for_trainer_client_id left join user_profiles up on up.user_id=c.user_id left join managed_clients m on m.id=c.managed_client_id
      where p.deleted_at is null and ${standard === true ? sql`p.owner_id is null` : standard === false ? sql`p.owner_id=${user}` : sql`(p.owner_id is null or p.owner_id=${user})`} order by p.updated_at desc,p.id`,
    );
  }
  async get(id: string) {
    const program = await one<M.Program>(
      this.db,
      sql`select p.*,coalesce(up.full_name,m.display_name) for_client_name,author.full_name source_author_name from programs p left join trainer_clients c on c.id=p.for_trainer_client_id left join user_profiles up on up.user_id=c.user_id left join managed_clients m on m.id=c.managed_client_id left join programs source on source.id=p.source_program_id left join user_profiles author on author.user_id=source.owner_id where p.id=${id}`,
    );
    if (!program) return null;
    const days = await rows<M.ProgramDay>(
      this.db,
      sql`select * from program_days where program_id=${id} order by position,id`,
    );
    const slots = await rows<M.ProgramSlot>(
      this.db,
      sql`select s.* from program_slots s join program_days d on d.id=s.day_id where d.program_id=${id} order by s.position,s.id`,
    );
    const variants = await rows<M.Variant>(
      this.db,
      sql`${variantSelect} join program_slots s on s.id=v.slot_id join program_days d on d.id=s.day_id where d.program_id=${id} order by v.variant_order,v.id`,
    );
    program.days = days.map((d) => ({
      ...d,
      slots: slots
        .filter((s) => s.day_id === d.id)
        .map((s) => ({ ...s, exercises: variants.filter((v) => v.slot_id === s.id) })),
    }));
    return program;
  }
  async create(
    owner: string,
    input: M.ProgramDraft,
    source?: string,
    card?: string,
    assignedBy?: string,
    assignedClient?: string,
  ) {
    const id = await insert(this.db, "programs", {
      id: input.id ?? crypto.randomUUID(),
      owner_id: owner,
      name: input.name,
      kind: input.kind,
      source_program_id: source ?? null,
      assigned_by: assignedBy ?? null,
      assigned_client_id: assignedClient ?? null,
      for_trainer_client_id: card ?? null,
    });
    for (const day of input.days) await this.writeDay(id, day, null);
    return id;
  }
  async update(id: string, input: M.ProgramDraft, now: string) {
    const old = (await this.get(id))!;
    // Keep the concurrency token strictly increasing even when two updates land
    // in one millisecond. The application compares this timestamp under the
    // program lock before any day or slot is modified.
    await this.db.execute(
      sql`update programs set name=${input.name}, kind=${input.kind},
      updated_at=greatest(${now}::timestamptz, updated_at + interval '1 millisecond')
      where id=${id}`,
    );
    for (const day of old.days.filter(
      (d) => !d.deleted_at && !input.days.some((n) => n.id === d.id),
    ))
      await this.dropDay(day, now);
    for (const day of input.days) {
      const existing = old.days.find((d) => d.id === day.id && !d.deleted_at) ?? null;
      if (existing) {
        for (const slot of existing.slots.filter(
          (s) => !s.deleted_at && !day.slots.some((n) => n.id === s.id),
        ))
          await this.dropSlot(slot, now);
        for (const slot of day.slots) {
          const prior = existing.slots.find((s) => s.id === slot.id && !s.deleted_at);
          if (prior)
            for (const variant of prior.exercises.filter(
              (v) => !v.deleted_at && !slot.exercises.some((n) => n.id === v.id),
            ))
              await this.dropVariant(variant, now);
        }
      }
      await this.writeDay(id, day, existing);
    }
  }
  private async writeDay(program: string, input: M.DayDraft, old: M.ProgramDay | null) {
    const id = input.id ?? crypto.randomUUID();
    if (old)
      await update(this.db, "program_days", id, { name: input.name, position: input.position });
    else
      await insert(this.db, "program_days", {
        id,
        program_id: program,
        name: input.name,
        position: input.position,
      });
    for (const slot of input.slots) {
      const sid = slot.id ?? crypto.randomUUID();
      const prior = old?.slots.find((s) => s.id === sid && !s.deleted_at);
      if (prior) await update(this.db, "program_slots", sid, { position: slot.position });
      else await insert(this.db, "program_slots", { id: sid, day_id: id, position: slot.position });
      for (const variant of slot.exercises) {
        const vid = variant.id ?? crypto.randomUUID();
        const data = {
          exercise_id: variant.exercise_id,
          custom_name: variant.custom_name,
          sets: variant.sets,
          reps: variant.reps,
          variant_order: variant.variant_order,
        };
        if (prior?.exercises.some((v) => v.id === vid && !v.deleted_at))
          await update(this.db, "program_slot_exercises", vid, data);
        else await insert(this.db, "program_slot_exercises", { id: vid, slot_id: sid, ...data });
      }
    }
  }
  private async dropVariant(v: M.Variant, now: string) {
    const pinned =
      v.deleted_at ||
      (await one(
        this.db,
        sql`select id from workout_sets where variant_id=${v.id} union all select id from workout_session_exercises where chosen_variant_id=${v.id} limit 1`,
      ));
    if (pinned) await update(this.db, "program_slot_exercises", v.id, { deleted_at: now });
    else await this.db.execute(sql`delete from program_slot_exercises where id=${v.id}`);
  }
  private async dropSlot(s: M.ProgramSlot, now: string) {
    for (const v of s.exercises) await this.dropVariant(v, now);
    const pinned =
      s.deleted_at ||
      (await one(
        this.db,
        sql`select id from workout_sets where slot_id=${s.id} union all select id from workout_session_exercises where slot_id=${s.id} union all select id from program_slot_exercises where slot_id=${s.id} limit 1`,
      ));
    if (pinned) await update(this.db, "program_slots", s.id, { deleted_at: now });
    else await this.db.execute(sql`delete from program_slots where id=${s.id}`);
  }
  private async dropDay(d: M.ProgramDay, now: string) {
    for (const s of d.slots) await this.dropSlot(s, now);
    const pinned = await one(
      this.db,
      sql`select id from workout_sessions where day_id=${d.id} union all select id from program_slots where day_id=${d.id} limit 1`,
    );
    if (pinned) await update(this.db, "program_days", d.id, { deleted_at: now });
    else await this.db.execute(sql`delete from program_days where id=${d.id}`);
  }
  async remove(id: string, now: string) {
    await update(this.db, "programs", id, { deleted_at: now });
  }
  async append(
    day: string,
    position: number,
    slot: string,
    variant: string,
    exercise: string,
    sets: number,
    reps: number,
  ) {
    await insert(this.db, "program_slots", { id: slot, day_id: day, position });
    await insert(this.db, "program_slot_exercises", {
      id: variant,
      slot_id: slot,
      exercise_id: exercise,
      sets,
      reps,
      variant_order: 0,
    });
  }
  async shareExercises(exercises: string[], owner: string, recipient: string) {
    if (!exercises.length) return;
    await this.db.execute(
      sql`insert into exercise_shares(id,exercise_id,user_id) select gen_random_uuid(),id,${recipient} from exercises where id in (${sql.join(
        exercises.map((e) => sql`${e}`),
        sql`,`,
      )}) and owner_id=${owner} on conflict(exercise_id,user_id) do nothing`,
    );
  }
  variant(id: string) {
    return one<M.HistoryVariant>(
      this.db,
      sql`select v.*,coalesce(e.name,v.custom_name,'') name,coalesce(length(e.contraindications)>0,false) has_contraindications,p.owner_id program_owner_id from program_slot_exercises v left join exercises e on e.id=v.exercise_id join program_slots s on s.id=v.slot_id join program_days d on d.id=s.day_id join programs p on p.id=d.program_id where v.id=${id}`,
    );
  }
}
