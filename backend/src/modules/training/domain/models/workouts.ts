// Workouts domain: performed sessions, sets and workout history/analytics filters.
import type { Day, Id, Instant } from "./shared.js";

export interface SetDraft {
  id: Id;
  slot_id: Id;
  variant_id: Id;
  weight: number;
  reps: number;
  performed_at: Instant;
}
export interface SessionDraft {
  id: Id;
  program_id: Id;
  day_id: Id;
  client_id: Id | null;
  started_at: Instant;
  finished_at: Instant;
  local_date: Day | null;
  exercises: { slot_id: Id; chosen_variant_id: Id; is_completed: boolean }[];
  sets: SetDraft[];
}
export interface Session {
  id: Id;
  program_id: Id;
  day_id: Id;
  self_user_id: Id | null;
  trainer_client_id: Id | null;
  seq_number: number;
  started_at: Instant;
  finished_at: Instant | null;
  local_date: Day;
  status: string;
}
export interface PerformedSet extends SetDraft {
  session_id: Id;
  local_date: Day;
  exercise_id: Id | null;
  name: string;
}
export interface WorkoutFilter {
  self_user_id: Id | null;
  trainer_client_id: Id | null;
  date_from?: Day;
  date_to?: Day;
  program_id?: Id | null;
  day_id?: Id | null;
  exercise_id?: Id | null;
  in_periods?: boolean;
}
export interface WorkoutPoint {
  date: Day;
  weight: number | null;
  reps: number | null;
  sets: number;
  session_count: number;
}
/**
 * A `WorkoutPoint` that still remembers which exercise produced it.
 *
 * `points()` collapses every exercise of a day into one average; the analytics
 * screen needs the same days split per exercise, so the grouped query carries
 * the exercise identity alongside each point and the application regroups.
 */
export interface ExerciseWorkoutPoint extends WorkoutPoint {
  exercise_id: Id;
  exercise_name: string;
}
