import { z } from "@hono/zod-openapi";
import type { ProgramApplication } from "../application/programs.js";
import type * as M from "../domain/models/index.js";
import * as s from "./schemas.js";
import { actor, boolean, id } from "./shared.js";
import {
  booleanQuery,
  endpoint,
  endpointResponse,
  OkResponse,
  type Endpoint,
  type EndpointPolicy,
} from "../../../endpoint.js";

/** Maps a program request body onto the domain draft shape, used by both create and update. */
function program(b: z.infer<typeof s.ProgramCreate>): M.ProgramDraft {
  return {
    id: b.id ?? null,
    name: b.name,
    kind: b.kind ?? "custom",
    days: b.days.map((d) => ({
      id: d.id ?? null,
      name: d.name,
      position: d.position,
      slots: (d.slots ?? []).map((slot) => ({
        id: slot.id ?? null,
        position: slot.position,
        exercises: slot.exercises.map((e) => ({
          id: e.id ?? null,
          exercise_id: e.exercise_id ?? null,
          custom_name: e.custom_name ?? null,
          sets: e.sets,
          reps: e.reps,
          variant_order: e.variant_order,
        })),
      })),
    })),
  };
}

/** Every operation here is behind a token and can refuse a program that is not the caller's. */
const programsPolicy = {
  security: [{ HTTPBearer: [] }],
  tags: ["programs"],
  errors: [401, 403, 404, 409, 422],
} satisfies EndpointPolicy;

/**
 * Training programs, their days and the exercises inside them.
 *
 * Each entry pairs the route with the handler that implements it, so an operationId, a path
 * and a body schema are named once and cannot drift between two files.
 */
export function programsEndpoints(programs: ProgramApplication): Endpoint[] {
  return [
    endpoint({
      ...programsPolicy,
      method: "post",
      path: "/api/v1/subscriptions/free-selection",
      operationId: "subscriptions_confirm_free_selection",
      summary: "Confirm free resources once for this expiry",
      body: z.object({
        cycle: z.string(),
        program_ids: z.array(z.string().uuid()),
        client_ids: z.array(z.string().uuid()),
        copies: z
          .array(z.object({ source_id: z.string().uuid(), program: s.ProgramCreate }))
          .max(11)
          .default([]),
      }),
      ok: OkResponse,
      handler: async (i) =>
        programs.confirmSelection(actor(i), {
          ...i.body,
          copies: i.body.copies.map((c) => ({
            source_id: c.source_id,
            program: program(c.program),
          })),
        }),
    }),
    endpoint({
      ...programsPolicy,
      method: "get",
      path: "/api/v1/programs",
      operationId: "programs_list_programs",
      summary: "List Programs",
      query: z.object({ standard: booleanQuery().optional() }),
      ok: z.array(s.ProgramListItem),
      handler: async (i) =>
        programs.list(actor(i), i.query.standard == null ? null : boolean(i.query.standard)),
    }),
    endpoint({
      ...programsPolicy,
      method: "get",
      path: "/api/v1/programs/{program_id}",
      operationId: "programs_get_program",
      summary: "Get Program",
      params: z.object({ program_id: z.string().uuid() }),
      ok: s.ProgramOut,
      handler: async (i) => programs.get(actor(i), id(i, "program_id")),
    }),
    endpoint({
      ...programsPolicy,
      method: "post",
      path: "/api/v1/programs",
      operationId: "programs_create_program",
      summary: "Create Program",
      body: s.ProgramCreate,
      ok: s.ProgramOut,
      okDescription: "Idempotent replay of an already-created program",
      created: { schema: s.ProgramOut },
      handler: async (input) => {
        const result = await programs.create(actor(input), program(input.body));
        return endpointResponse(result.value, result.created ? 201 : 200);
      },
    }),
    endpoint({
      ...programsPolicy,
      method: "put",
      path: "/api/v1/programs/{program_id}",
      operationId: "programs_update_program",
      summary: "Update Program",
      params: z.object({ program_id: z.string().uuid() }),
      body: s.ProgramUpdate,
      ok: s.ProgramOut,
      handler: async (input) =>
        programs.update(
          actor(input),
          id(input, "program_id"),
          program(input.body),
          input.body.expected_updated_at,
        ),
    }),
    endpoint({
      ...programsPolicy,
      method: "delete",
      path: "/api/v1/programs/{program_id}",
      operationId: "programs_delete_program",
      summary: "Delete Program",
      params: z.object({ program_id: z.string().uuid() }),
      status: 204,
      handler: async (i) => programs.remove(actor(i), id(i, "program_id")),
    }),
    endpoint({
      ...programsPolicy,
      method: "post",
      path: "/api/v1/programs/{program_id}/exercises",
      operationId: "programs_add_exercise_to_program",
      summary: "Add Exercise To Program",
      params: z.object({ program_id: z.string().uuid() }),
      body: s.AddExerciseToProgramRequest,
      ok: s.ProgramOut,
      handler: async (input) => {
        return programs.append(actor(input), id(input, "program_id"), {
          day_id: input.body.day_id,
          exercise_id: input.body.exercise_id,
          sets: input.body.sets ?? 3,
          reps: input.body.reps ?? 10,
          slot_id: input.body.slot_id ?? null,
          slot_exercise_id: input.body.slot_exercise_id ?? null,
        });
      },
    }),
    endpoint({
      ...programsPolicy,
      method: "post",
      path: "/api/v1/programs/{program_id}/share",
      operationId: "programs_share_program",
      summary: "Share Program",
      params: z.object({ program_id: z.string().uuid() }),
      body: s.ShareProgramRequest,
      ok: s.ProgramListItem,
      handler: async (input) =>
        programs.share(actor(input), id(input, "program_id"), input.body.client_id),
    }),
  ];
}
