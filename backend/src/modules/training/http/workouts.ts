import { z } from "@hono/zod-openapi";
import type { WorkoutApplication } from "../application/workouts.js";
import * as s from "./schemas.js";
import { actor, id, nullableString } from "./shared.js";
import {
  endpoint,
  endpointResponse,
  type Endpoint,
  type EndpointPolicy,
} from "../../../endpoint.js";

/** Every operation is behind a token and hides sessions or variants the caller cannot read. */
const workoutsPolicy = {
  security: [{ HTTPBearer: [] }],
  tags: ["workouts"],
  errors: [401, 404, 422],
} satisfies EndpointPolicy;

/**
 * Workout sessions: offline-first sync, durable summary and per-exercise history.
 *
 * Each entry pairs the route with the handler that implements it, so an operationId, a path
 * and a body schema are named once and cannot drift between two files.
 */
export function workoutsEndpoints(workouts: WorkoutApplication): Endpoint[] {
  return [
    endpoint({
      ...workoutsPolicy,
      method: "post",
      path: "/api/v1/workouts/sessions/sync",
      operationId: "workouts_sync_session",
      summary: "Sync Session",
      body: s.SessionSyncRequest,
      ok: s.SessionSummaryOut,
      okDescription: "Idempotent replay of an already-synced session",
      created: { schema: s.SessionSummaryOut },
      handler: async (input) => {
        const result = await workouts.sync(actor(input), {
          id: input.body.id,
          program_id: input.body.program_id,
          day_id: input.body.day_id,
          client_id: input.body.client_id ?? null,
          started_at: input.body.started_at,
          finished_at: input.body.finished_at,
          local_date: input.body.local_date ?? null,
          exercises: input.body.exercises.map((e) => ({
            slot_id: e.slot_id,
            chosen_variant_id: e.chosen_variant_id,
            is_completed: e.is_completed,
          })),
          sets: input.body.sets.map((set) => ({
            id: set.id,
            slot_id: set.slot_id,
            variant_id: set.variant_id,
            weight: set.weight,
            reps: set.reps,
            performed_at: set.performed_at,
          })),
        });
        return endpointResponse(result.value, result.created ? 201 : 200);
      },
    }),
    endpoint({
      ...workoutsPolicy,
      method: "get",
      path: "/api/v1/workouts/sessions/{session_id}/summary",
      operationId: "workouts_get_session_summary",
      summary: "Get Session Summary",
      params: z.object({ session_id: z.string().uuid() }),
      ok: s.SessionSummaryOut,
      handler: async (i) => workouts.getSummary(actor(i), id(i, "session_id")),
    }),
    endpoint({
      ...workoutsPolicy,
      method: "get",
      path: "/api/v1/workouts/history/by-variant/{variant_id}",
      operationId: "workouts_exercise_history",
      summary: "Exercise History",
      query: z.object({ client_id: z.union([z.string().uuid(), z.null()]).optional() }),
      params: z.object({ variant_id: z.string().uuid() }),
      ok: s.ExerciseHistoryOut,
      handler: async (i) =>
        workouts.history(actor(i), id(i, "variant_id"), nullableString(i.query.client_id)),
    }),
  ];
}
