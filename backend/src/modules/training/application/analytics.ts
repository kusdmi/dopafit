import type * as M from "../domain/models/index.js";
import type { Repositories, TrainingUnitOfWork } from "../domain/ports.js";
import {
  average,
  changePercent,
  fail,
  parameterStats,
  requireCard,
  round,
} from "../domain/rules.js";
import { privatePhotoUrl } from "./photo-url.js";

async function target(r: Repositories, actor: M.Actor, client: string | null) {
  if (!client)
    return { self_user_id: actor.id, trainer_client_id: null, measurement_user: actor.id };
  const card = requireCard(actor, await r.clients.get(client), true);
  return { self_user_id: card.user_id, trainer_client_id: card.id, measurement_user: card.user_id };
}
export class AnalyticsApplication {
  constructor(
    private readonly uow: TrainingUnitOfWork,
    private readonly now: () => string,
  ) {}
  workouts(
    actor: M.Actor,
    input: {
      client_id: string | null;
      date_from: string;
      date_to: string;
      program_id: string | null;
      day_id: string | null;
      exercise_id: string | null;
    },
  ) {
    return this.uow.run([], async (r) => {
      const range = (await r.access?.range(actor.id, input.date_from, input.date_to)) ?? {
        date_from: input.date_from,
        date_to: input.date_to,
        limited: false,
      };
      input = { ...input, date_from: range.date_from, date_to: range.date_to };
      const owner = await target(r, actor, input.client_id);
      const rows = await r.workouts.points({ ...input, ...owner, in_periods: true });
      const weights = rows.flatMap((p) => (p.weight === null ? [] : [p.weight]));
      const reps = rows.flatMap((p) => (p.reps === null ? [] : [p.reps]));
      return {
        range,
        points: rows.map((p) => ({
          date: p.date,
          weight: p.weight,
          reps: p.reps,
          sets: p.sets,
          session_count: p.session_count,
        })),
        stats: {
          avg_weight: weights.length ? round(average(weights)) : null,
          avg_reps: reps.length ? round(average(reps)) : null,
          total_workouts: rows.reduce((n, p) => n + p.session_count, 0),
        },
      };
    });
  }
  /**
   * The same view as `workouts()`, split into one series per exercise.
   *
   * The analytics screen draws a card per exercise of the chosen program day,
   * which the averaged series cannot express — so the grouped rows are regrouped
   * here rather than asking the client to issue one request per exercise.
   *
   * Insertion order of the Map is the SQL order (by date), so exercises come out
   * in the order their first recorded day occurred, and `stats` is computed per
   * exercise with the same rules the ungrouped response uses.
   */
  workoutsByExercise(
    actor: M.Actor,
    input: {
      client_id: string | null;
      date_from: string;
      date_to: string;
      program_id: string | null;
      day_id: string | null;
      exercise_id: string | null;
    },
  ) {
    return this.uow.run([], async (r) => {
      const range = (await r.access?.range(actor.id, input.date_from, input.date_to)) ?? {
        date_from: input.date_from,
        date_to: input.date_to,
        limited: false,
      };
      input = { ...input, date_from: range.date_from, date_to: range.date_to };
      const owner = await target(r, actor, input.client_id);
      const rows = await r.workouts.pointsByExercise({ ...input, ...owner, in_periods: true });
      const byExercise = new Map<string, { name: string; points: M.ExerciseWorkoutPoint[] }>();
      for (const row of rows) {
        const found = byExercise.get(row.exercise_id);
        if (found) found.points.push(row);
        else byExercise.set(row.exercise_id, { name: row.exercise_name, points: [row] });
      }
      return {
        range,
        exercises: [...byExercise].map(([exercise_id, { name, points }]) => {
          const weights = points.flatMap((p) => (p.weight === null ? [] : [p.weight]));
          const reps = points.flatMap((p) => (p.reps === null ? [] : [p.reps]));
          return {
            exercise_id,
            name,
            points: points.map((p) => ({
              date: p.date,
              weight: p.weight,
              reps: p.reps,
              sets: p.sets,
              session_count: p.session_count,
            })),
            stats: {
              avg_weight: weights.length ? round(average(weights)) : null,
              avg_reps: reps.length ? round(average(reps)) : null,
              // Sessions that contain THIS exercise, not every session of the day:
              // a day appears once per exercise, so summing per-exercise session
              // counts would count a two-exercise day twice.
              total_workouts: points.reduce((n, p) => n + p.session_count, 0),
            },
          };
        }),
      };
    });
  }
  anthropometry(
    actor: M.Actor,
    input: {
      client_id: string | null;
      date_from: string;
      date_to: string;
      // The six the chart plots, not every measurement column: these are echoed back in the
      // response, where `ParameterSeries.parameter` documents exactly this enum.
      parameters: M.BodyParameter[];
      custom_slots: number[];
    },
  ) {
    return this.uow.run([], async (r) => {
      const range = (await r.access?.range(actor.id, input.date_from, input.date_to)) ?? {
        date_from: input.date_from,
        date_to: input.date_to,
        limited: false,
      };
      input = { ...input, date_from: range.date_from, date_to: range.date_to };
      const owner = await target(r, actor, input.client_id);
      if (!owner.measurement_user) return { parameters: [], range };
      const fields = await r.measurements.fields(owner.measurement_user);
      const parameters = await Promise.all(
        [...input.parameters, ...input.custom_slots].map(async (field) => {
          const points = await r.measurements.points(
            owner.measurement_user!,
            owner.trainer_client_id,
            field,
            input.date_from,
            input.date_to,
          );
          const configured =
            typeof field === "number" ? fields.find((f) => f.slot === field) : null;
          return {
            parameter: typeof field === "string" ? field : null,
            custom_slot: typeof field === "number" ? field : null,
            name: configured?.name ?? null,
            unit: configured?.unit ?? null,
            points,
            stats: parameterStats(points),
          };
        }),
      );
      return { parameters, range };
    });
  }
  available(actor: M.Actor, client: string | null) {
    return this.uow.run([], async (r) => {
      const owner = await target(r, actor, client);
      if (!owner.measurement_user) return { parameters: [], custom_slots: [] };
      return r.measurements.available(owner.measurement_user);
    });
  }
  photos(actor: M.Actor, kind: M.PhotoKind, client: string | null) {
    if (client) fail("forbidden", "Client photos are private");
    return this.uow.run([], async (r) => {
      const range = await r.access?.range(actor.id, "0001-01-01", this.now().slice(0, 10));
      return {
        dates: (await r.measurements.photoDates(actor.id, kind))
          .filter((p) => !range || p.date! >= range.date_from)
          .map((p) => p.date!),
      };
    });
  }
  compare(actor: M.Actor, kind: M.PhotoKind, first: string, second: string, client: string | null) {
    if (client) fail("forbidden", "Client photos are private");
    return this.uow.run([], async (r) => {
      const range = await r.access?.range(
        actor.id,
        first < second ? first : second,
        first > second ? first : second,
      );
      if (range?.limited) fail("forbidden", "Сравнение фото доступно за последние 30 дней");
      const photos = await r.measurements.photoDates(actor.id, kind);
      const a = photos.find((p) => p.date === first);
      const b = photos.find((p) => p.date === second);
      if (!a || !b) return fail("not_found", "Photo not found for one of the dates");
      return {
        first: { date: first, url: privatePhotoUrl(a.measurement_id, kind) },
        second: { date: second, url: privatePhotoUrl(b.measurement_id, kind) },
      };
    });
  }
  /**
   * The exercises the strength picker on Home may offer: only those the actor has
   * actually lifted, so every option charts something rather than an empty series.
   */
  strengthExercises(actor: M.Actor) {
    return this.uow.run([], async (r) => ({
      items: await r.workouts.strengthExercises({
        self_user_id: actor.id,
        trainer_client_id: null,
      }),
    }));
  }
  dashboard(
    actor: M.Actor,
    input: {
      measurement_parameter: M.MeasurementField;
      record_exercise_id: string | null;
      strength_exercise_id: string | null;
      period: "1m" | "3m" | "6m" | "1y";
    },
  ) {
    return this.uow.run([], async (r) => {
      const today = this.now().slice(0, 10);
      const shift = (date: string, days: number) =>
        new Date(Date.parse(date) + days * 86400000).toISOString().slice(0, 10);
      let from = shift(today, -{ "1m": 30, "3m": 90, "6m": 180, "1y": 365 }[input.period]);
      const monday = shift(today, -((new Date(today).getUTCDay() + 6) % 7));
      const range = await r.access?.range(actor.id, from, today);
      from = range?.date_from ?? from;
      const owner = { self_user_id: actor.id, trainer_client_id: null };
      const workouts = await r.workouts.points({
        ...owner,
        date_from: monday,
        date_to: shift(monday, 6),
      });
      const bookings = await r.calendar.bookings(actor.id, monday, shift(monday, 6));
      const week = Array.from({ length: 7 }, (_, i) => {
        const date = shift(monday, i);
        return {
          date,
          has_personal_workout:
            workouts.some((w) => w.date === date) ||
            bookings.some((b) => b.date === date && b.type === "personal"),
          has_client_workout: bookings.some((b) => b.date === date && b.type === "with_clients"),
        };
      });
      const month_workout_count = await r.workouts.count({
        ...owner,
        date_from: `${today.slice(0, 7)}-01`,
        date_to: today,
      });
      const recordRange = await r.access?.range(actor.id, "0001-01-01", today);
      const personal_record = await r.workouts.best({
        date_from: recordRange?.limited ? recordRange.date_from : undefined,
        ...owner,
        exercise_id: input.record_exercise_id,
      });
      const measurements = await r.measurements.points(
        actor.id,
        null,
        input.measurement_parameter,
        from,
        today,
      );
      const exercise = input.strength_exercise_id ?? personal_record?.exercise_id;
      const strength = exercise
        ? await r.workouts.strength({
            ...owner,
            exercise_id: exercise,
            date_from: from,
            date_to: today,
          })
        : [];
      return {
        full_name: (await r.clients.account(actor.id))?.full_name ?? "",
        week,
        month_workout_count,
        personal_record,
        measurement_chart: {
          points: measurements,
          change_percent: changePercent(measurements.map((p) => p.value)),
        },
        strength_chart: {
          points: strength,
          change_percent: changePercent(strength.map((p) => p.value)),
        },
      };
    });
  }
}
