import type * as M from "../domain/models/index.js";
import type { Repositories, TrainingUnitOfWork } from "../domain/ports.js";
import { average, fail, requireCard, round, validateLocalDate } from "../domain/rules.js";

export function sessionSummary(
  session: M.Session,
  current: M.PerformedSet[],
  past: M.PerformedSet[],
) {
  if (!session.finished_at) return fail("not_found", "Session not finished");
  const weights = new Map<string, { name: string; exerciseId: string | null; values: number[] }>();
  for (const set of current) {
    const key = set.exercise_id ?? `custom:${set.name}`;
    const group = weights.get(key) ?? { name: set.name, exerciseId: set.exercise_id, values: [] };
    group.values.push(set.weight);
    weights.set(key, group);
  }
  const exercises = [...weights.values()].map((group) => {
    const sessions = new Map<string, number[]>();
    if (group.exerciseId)
      for (const set of past.filter((s) => s.exercise_id === group.exerciseId)) {
        const values = sessions.get(set.session_id) ?? [];
        values.push(set.weight);
        sessions.set(set.session_id, values);
      }
    const histories = [...sessions.values()];
    const statistic = (fn: (values: number[]) => number) => {
      const value = round(fn(group.values), 2);
      return {
        value,
        delta: histories.length ? round(value - average(histories.map(fn)), 2) : null,
      };
    };
    return {
      name: group.name,
      max: statistic((v) => Math.max(...v)),
      avg: statistic(average),
      min: statistic((v) => Math.min(...v)),
    };
  });
  const times = current.map((s) => Date.parse(s.performed_at)).sort((a, b) => a - b);
  return {
    session_id: session.id,
    seq_number: session.seq_number,
    finished_at: session.finished_at,
    duration_seconds: Math.trunc(
      (Date.parse(session.finished_at) - Date.parse(session.started_at)) / 1000,
    ),
    avg_rest_seconds:
      times.length >= 2
        ? Math.trunc((times.at(-1)! - times[0]!) / (times.length - 1) / 1000)
        : null,
    exercises,
  };
}
async function summary(r: Repositories, s: M.Session, user: string) {
  const value = sessionSummary(s, await r.workouts.sets(s.id), await r.workouts.priorSets(s));
  if (r.access && !(await r.access.premium(user))) value.avg_rest_seconds = null;
  return value;
}
export class WorkoutApplication {
  constructor(private readonly uow: TrainingUnitOfWork) {}
  sync(actor: M.Actor, input: M.SessionDraft) {
    validateLocalDate(input);
    return this.uow.run(
      [
        `entitlements:${actor.id}`,
        `session:${input.id}`,
        `program:${input.program_id}`,
        input.client_id ? `card:${input.client_id}` : `workouts:${actor.id}`,
      ],
      async (r) => {
        const existing = await r.workouts.get(input.id);
        if (existing) {
          if (existing.self_user_id) {
            if (existing.self_user_id !== actor.id) return fail("not_found", "Session not found");
          } else if (existing.trainer_client_id) {
            requireCard(actor, await r.clients.get(existing.trainer_client_id), true);
          } else {
            return fail("not_found", "Session not found");
          }
          return { value: await summary(r, existing, actor.id), created: false };
        }
        const card = input.client_id
          ? requireCard(actor, await r.clients.get(input.client_id), true)
          : null;
        const program = await r.programs.get(input.program_id);
        if (
          !program ||
          (program.owner_id !== null &&
            program.owner_id !== actor.id &&
            program.owner_id !== card?.user_id)
        )
          return fail("not_found", "Program not found");
        const day = program.days.find((day) => day.id === input.day_id);
        if (!day) return fail("not_found", "Day not found in program");
        // Deleted nodes remain valid for an offline session captured before a program edit.
        // Both selections and sets must still refer to the exact day/slot subtree.
        const matches = (slotId: string, variantId: string) =>
          day.slots.some(
            (slot) =>
              slot.id === slotId && slot.exercises.some((variant) => variant.id === variantId),
          );
        if (
          input.exercises.some(
            (exercise) => !matches(exercise.slot_id, exercise.chosen_variant_id),
          ) ||
          input.sets.some((set) => !matches(set.slot_id, set.variant_id))
        )
          return fail("not_found", "Exercise not found in program day");
        await r.access?.workout(actor.id, input.program_id, input.started_at, input.client_id);
        const user = input.client_id ? null : actor.id;
        const sequence = await r.workouts.nextSequence(user, input.client_id);
        await r.workouts.create(input, user, input.client_id, sequence);
        const session = (await r.workouts.get(input.id))!;
        await r.calendar.completeFromSession(session, actor.id);
        return { value: await summary(r, session, actor.id), created: true };
      },
    );
  }
  getSummary(actor: M.Actor, sessionId: string) {
    return this.uow.run([], async (r) => {
      const session = await r.workouts.get(sessionId);
      if (!session || session.status !== "finished") return fail("not_found", "Session not found");
      if (session.self_user_id) {
        if (session.self_user_id !== actor.id) return fail("not_found", "Session not found");
      } else if (session.trainer_client_id) {
        requireCard(actor, await r.clients.get(session.trainer_client_id), true);
      } else {
        return fail("not_found", "Session not found");
      }
      return summary(r, session, actor.id);
    });
  }
  history(actor: M.Actor, variant: string, client: string | null) {
    return this.uow.run([], async (r) => {
      const card = client ? requireCard(actor, await r.clients.get(client), true) : null;
      const sets = await r.workouts.history(
        variant,
        client ? (card?.user_id ?? null) : actor.id,
        card?.id ?? null,
      );
      const ref = await r.programs.variant(variant);
      if (
        ref &&
        ref.program_owner_id !== null &&
        ref.program_owner_id !== actor.id &&
        ref.program_owner_id !== card?.user_id
      )
        return fail("not_found", "Exercise not found");
      const days = new Map<
        string,
        { set_id: string; weight: number; reps: number; performed_at: string }[]
      >();
      for (const set of sets) {
        const entries = days.get(set.local_date) ?? [];
        entries.push({
          set_id: set.id,
          weight: set.weight,
          reps: set.reps,
          performed_at: set.performed_at,
        });
        days.set(set.local_date, entries);
      }
      return {
        exercise_id: ref?.exercise_id ?? null,
        name: ref?.name ?? "",
        days: [...days]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, entries]) => ({ date, entries })),
      };
    });
  }
}
