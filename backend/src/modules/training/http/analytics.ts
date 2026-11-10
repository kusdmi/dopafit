import { z } from "@hono/zod-openapi";
import type { AnalyticsApplication } from "../application/analytics.js";
import * as s from "./schemas.js";
import { actor, nullableString } from "./shared.js";
import { endpoint, type Endpoint, type EndpointPolicy } from "../../../endpoint.js";

/** Every view can be asked for a client's data, and so can refuse a caller who is not theirs. */
const analyticsPolicy = {
  security: [{ HTTPBearer: [] }],
  tags: ["analytics"],
  errors: [401, 403, 404, 422],
} satisfies EndpointPolicy;

/**
 * Aggregated views over workouts and anthropometry.
 *
 * Each entry pairs the route with the handler that implements it, so an operationId, a path
 * and a body schema are named once and cannot drift between two files.
 */
export function analyticsEndpoints(analytics: AnalyticsApplication): Endpoint[] {
  return [
    endpoint({
      ...analyticsPolicy,
      method: "get",
      path: "/api/v1/analytics/anthropometry/parameters",
      operationId: "analytics_available_parameters",
      summary: "Measurement parameters with any history",
      query: z.object({ client_id: z.string().uuid().optional() }),
      ok: s.AvailableMeasurementsOut,
      handler: (i) => analytics.available(actor(i), nullableString(i.query.client_id)),
    }),
    endpoint({
      ...analyticsPolicy,
      method: "get",
      path: "/api/v1/analytics/dashboard",
      operationId: "analytics_get_dashboard",
      summary: "Get Dashboard",
      query: z.object({
        measurement_parameter: s.BodyParameter.default("weight").optional(),
        record_exercise_id: z.union([z.string().uuid(), z.null()]).optional(),
        strength_exercise_id: z.union([z.string().uuid(), z.null()]).optional(),
        period: s.DashboardPeriod.default("1y").optional(),
      }),
      ok: s.DashboardOut,
      handler: async (i) =>
        analytics.dashboard(actor(i), {
          measurement_parameter: s.BodyParameter.parse(i.query.measurement_parameter ?? "weight"),
          record_exercise_id: nullableString(i.query.record_exercise_id),
          strength_exercise_id: nullableString(i.query.strength_exercise_id),
          period: s.DashboardPeriod.parse(i.query.period ?? "1y"),
        }),
    }),
    endpoint({
      ...analyticsPolicy,
      method: "get",
      path: "/api/v1/analytics/strength-exercises",
      operationId: "analytics_strength_exercises",
      summary: "Strength Exercises",
      ok: s.StrengthExercisesOut,
      handler: async (i) => analytics.strengthExercises(actor(i)),
    }),
    endpoint({
      ...analyticsPolicy,
      method: "get",
      path: "/api/v1/analytics/workouts/series",
      operationId: "analytics_workout_series",
      summary: "Workout Series",
      query: z.object({
        date_from: z.string().date(),
        date_to: z.string().date(),
        client_id: z.union([z.string().uuid(), z.null()]).optional(),
        program_id: z.union([z.string().uuid(), z.null()]).optional(),
        day_id: z.union([z.string().uuid(), z.null()]).optional(),
        exercise_id: z.union([z.string().uuid(), z.null()]).optional(),
        metric: s.WorkoutMetric.default("weight").optional(),
      }),
      ok: s.WorkoutSeriesOut,
      handler: async (i) =>
        analytics.workouts(actor(i), {
          client_id: nullableString(i.query.client_id),
          date_from: z.string().date().parse(i.query.date_from),
          date_to: z.string().date().parse(i.query.date_to),
          program_id: nullableString(i.query.program_id),
          day_id: nullableString(i.query.day_id),
          exercise_id: nullableString(i.query.exercise_id),
        }),
    }),
    endpoint({
      ...analyticsPolicy,
      method: "get",
      path: "/api/v1/analytics/workouts/series-by-exercise",
      operationId: "analytics_workout_series_by_exercise",
      summary: "Workout Series By Exercise",
      query: z.object({
        date_from: z.string().date(),
        date_to: z.string().date(),
        client_id: z.union([z.string().uuid(), z.null()]).optional(),
        program_id: z.union([z.string().uuid(), z.null()]).optional(),
        day_id: z.union([z.string().uuid(), z.null()]).optional(),
        exercise_id: z.union([z.string().uuid(), z.null()]).optional(),
      }),
      ok: s.WorkoutSeriesByExerciseOut,
      handler: async (i) =>
        analytics.workoutsByExercise(actor(i), {
          client_id: nullableString(i.query.client_id),
          date_from: z.string().date().parse(i.query.date_from),
          date_to: z.string().date().parse(i.query.date_to),
          program_id: nullableString(i.query.program_id),
          day_id: nullableString(i.query.day_id),
          exercise_id: nullableString(i.query.exercise_id),
        }),
    }),
    endpoint({
      ...analyticsPolicy,
      method: "get",
      path: "/api/v1/analytics/anthropometry/series",
      operationId: "analytics_anthropometry_series",
      summary: "Anthropometry Series",
      query: z.object({
        date_from: z.string().date(),
        date_to: z.string().date(),
        parameters: z.array(s.BodyParameter).optional(),
        custom_slots: z.array(z.coerce.number().int().min(1).max(3)).max(3).optional(),
        client_id: z.union([z.string().uuid(), z.null()]).optional(),
      }),
      ok: s.AnthropometrySeriesOut,
      handler: async (i) =>
        analytics.anthropometry(actor(i), {
          client_id: nullableString(i.query.client_id),
          date_from: z.string().date().parse(i.query.date_from),
          date_to: z.string().date().parse(i.query.date_to),
          parameters: z.array(s.BodyParameter).parse(i.query.parameters ?? []),
          custom_slots: z
            .array(z.coerce.number().int().min(1).max(3))
            .max(3)
            .parse(i.query.custom_slots ?? []),
        }),
    }),
    endpoint({
      ...analyticsPolicy,
      method: "get",
      path: "/api/v1/analytics/photos/dates",
      operationId: "analytics_photo_dates",
      summary: "Photo Dates",
      query: z.object({
        kind: s.PhotoKind,
        client_id: z.union([z.string().uuid(), z.null()]).optional(),
      }),
      ok: s.PhotoDatesOut,
      handler: async (i) =>
        analytics.photos(
          actor(i),
          s.PhotoKind.parse(i.query.kind),
          nullableString(i.query.client_id),
        ),
    }),
    endpoint({
      ...analyticsPolicy,
      method: "get",
      path: "/api/v1/analytics/photos/compare",
      operationId: "analytics_compare_photos",
      summary: "Compare Photos",
      query: z.object({
        kind: s.PhotoKind,
        first_date: z.string().date(),
        second_date: z.string().date(),
        client_id: z.union([z.string().uuid(), z.null()]).optional(),
      }),
      ok: s.PhotoComparisonOut,
      handler: async (i) =>
        analytics.compare(
          actor(i),
          s.PhotoKind.parse(i.query.kind),
          z.string().date().parse(i.query.first_date),
          z.string().date().parse(i.query.second_date),
          nullableString(i.query.client_id),
        ),
    }),
  ];
}
