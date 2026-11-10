import { sql } from "drizzle-orm";
import type { WorkoutRepository } from "../domain/ports.js";
import type * as M from "../domain/models/index.js";
import { insert, one, rows, timestampPeriod, type Executor } from "./sql.js";

const setSelect = sql`select s.*,s.weight::float8 weight,w.local_date,v.exercise_id,coalesce(e.name,v.custom_name,'') name from workout_sets s join workout_sessions w on w.id=s.session_id join program_slot_exercises v on v.id=s.variant_id left join exercises e on e.id=v.exercise_id`;
// A linked client's own sessions retain self_user_id. Trainer views combine
// them with sessions the trainer recorded against the card; the period filter
// below limits both sources to the active relationship.
const owner = (user: string | null, card: string | null) =>
  user && card
    ? sql`(w.self_user_id=${user} or w.trainer_client_id=${card})`
    : user
      ? sql`w.self_user_id=${user}`
      : sql`w.trainer_client_id=${card}`;
function filter(f: M.WorkoutFilter) {
  return sql`${owner(f.self_user_id, f.trainer_client_id)} and w.status='finished'
  ${f.date_from ? sql`and w.local_date>=${f.date_from}` : sql``} ${f.date_to ? sql`and w.local_date<=${f.date_to}` : sql``}
  ${f.program_id ? sql`and w.program_id=${f.program_id}` : sql``} ${f.day_id ? sql`and w.day_id=${f.day_id}` : sql``}
  ${f.exercise_id ? sql`and v.exercise_id=${f.exercise_id}` : sql``}
  ${f.in_periods && f.trainer_client_id ? sql`and ${timestampPeriod(f.trainer_client_id, sql`w.started_at`)}` : sql``}`;
}
export class PgWorkoutRepository implements WorkoutRepository {
  constructor(private readonly db: Executor) {}
  get(id: string) {
    return one<M.Session>(this.db, sql`select * from workout_sessions where id=${id}`);
  }
  async nextSequence(user: string | null, card: string | null) {
    return (await one<{ seq: number }>(
      this.db,
      sql`select coalesce(max(w.seq_number),0)+1 seq from workout_sessions w where ${owner(user, card)}`,
    ))!.seq;
  }
  async create(input: M.SessionDraft, user: string | null, card: string | null, sequence: number) {
    await insert(this.db, "workout_sessions", {
      id: input.id,
      program_id: input.program_id,
      day_id: input.day_id,
      self_user_id: user,
      trainer_client_id: card,
      seq_number: sequence,
      started_at: input.started_at,
      finished_at: input.finished_at,
      local_date: input.local_date ?? new Date(input.started_at).toISOString().slice(0, 10),
      status: "finished",
    });
    for (const ex of input.exercises)
      await insert(this.db, "workout_session_exercises", { session_id: input.id, ...ex });
    for (const set of input.sets)
      await insert(this.db, "workout_sets", { session_id: input.id, ...set });
  }
  sets(session: string) {
    return rows<M.PerformedSet>(
      this.db,
      sql`${setSelect} where w.id=${session} order by s.performed_at,s.id`,
    );
  }
  priorSets(session: M.Session) {
    return rows<M.PerformedSet>(
      this.db,
      sql`${setSelect} where ${owner(session.self_user_id, session.trainer_client_id)} and w.id<>${session.id} and w.status='finished' order by s.performed_at,s.id`,
    );
  }
  history(variant: string, user: string | null, card: string | null) {
    return rows<M.PerformedSet>(
      this.db,
      sql`${setSelect} where ${owner(user, card)} and s.variant_id=${variant} ${card ? sql`and ${timestampPeriod(card, sql`w.started_at`)}` : sql``} order by s.performed_at,s.id`,
    );
  }
  points(f: M.WorkoutFilter) {
    return rows<M.WorkoutPoint>(
      this.db,
      sql`select w.local_date date,avg(s.weight)::float8 weight,avg(s.reps)::float8 reps,count(s.id)::int sets,count(distinct w.id)::int session_count from workout_sets s join workout_sessions w on w.id=s.session_id join program_slot_exercises v on v.id=s.variant_id where ${filter(f)} group by w.local_date order by w.local_date`,
    );
  }
  /**
   * The same days as `points()`, but grouped by exercise as well as date.
   *
   * `points()` averages every exercise of a day together, which is right for the
   * home dashboard and wrong for the analytics screen: a day of bench press and
   * pull-ups is one number there and two charts here. Grouping by exercise keeps
   * the aggregate per (exercise, day) and lets the application regroup into one
   * series per exercise.
   *
   * `coalesce(e.name, v.custom_name, '')` matches `setSelect` above: a variant may
   * be a catalogue exercise or the user's own custom one, and a custom exercise
   * has no row in `exercises`.
   */
  pointsByExercise(f: M.WorkoutFilter) {
    return rows<M.ExerciseWorkoutPoint>(
      this.db,
      sql`select w.local_date date,v.exercise_id,coalesce(e.name,v.custom_name,'') exercise_name,avg(s.weight)::float8 weight,avg(s.reps)::float8 reps,count(s.id)::int sets,count(distinct w.id)::int session_count from workout_sets s join workout_sessions w on w.id=s.session_id join program_slot_exercises v on v.id=s.variant_id left join exercises e on e.id=v.exercise_id where ${filter(f)} and v.exercise_id is not null group by w.local_date,v.exercise_id,coalesce(e.name,v.custom_name,'') order by w.local_date`,
    );
  }
  async count(f: M.WorkoutFilter) {
    return (await one<{ count: number }>(
      this.db,
      sql`select count(*)::int count from workout_sessions w where ${filter({ ...f, exercise_id: null })}`,
    ))!.count;
  }
  best(f: M.WorkoutFilter) {
    return one<{ exercise_id: string; exercise_name: string; weight: number }>(
      this.db,
      sql`select v.exercise_id,e.name exercise_name,max(s.weight)::float8 weight from workout_sets s join workout_sessions w on w.id=s.session_id join program_slot_exercises v on v.id=s.variant_id join exercises e on e.id=v.exercise_id where ${filter(f)} group by v.exercise_id,e.name order by max(s.weight) desc,v.exercise_id limit 1`,
    );
  }
  /**
   * Every exercise the filter's owner has a weighted set for, newest work first.
   * Same joins as `best()` minus the `limit 1`: the strength picker must offer
   * exactly the exercises that can produce a chart, not the whole catalogue.
   */
  strengthExercises(f: M.WorkoutFilter) {
    return rows<{ exercise_id: string; exercise_name: string }>(
      this.db,
      sql`select v.exercise_id,e.name exercise_name from workout_sets s join workout_sessions w on w.id=s.session_id join program_slot_exercises v on v.id=s.variant_id join exercises e on e.id=v.exercise_id where ${filter(f)} and s.weight is not null group by v.exercise_id,e.name order by max(w.local_date) desc,e.name`,
    );
  }
  strength(f: M.WorkoutFilter) {
    return rows<M.Point>(
      this.db,
      sql`select w.local_date date,max(s.weight)::float8 value from workout_sets s join workout_sessions w on w.id=s.session_id join program_slot_exercises v on v.id=s.variant_id where ${filter(f)} group by w.local_date order by w.local_date`,
    );
  }
}
