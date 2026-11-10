import { z } from "@hono/zod-openapi";
import type { CatalogApplication } from "../application/catalog.js";
import * as s from "./schemas.js";
import { actor, boolean, id, mediaUpload, nullableString, number } from "./shared.js";
import {
  booleanQuery,
  endpoint,
  integerParam,
  type Endpoint,
  type EndpointPolicy,
} from "../../../endpoint.js";

/** Every operation here is behind a token and answers the same four failures. */
const exercises = {
  security: [{ HTTPBearer: [] }],
  tags: ["exercises"],
  errors: [401, 404, 409, 422],
} satisfies EndpointPolicy;

/**
 * The exercise catalog: categories, exercises, favourites and their media.
 *
 * Each entry pairs the route with the handler that implements it, so an operationId, a path
 * and a body schema are named once and cannot drift between two files.
 */
export function catalogEndpoints(catalog: CatalogApplication): Endpoint[] {
  return [
    endpoint({
      ...exercises,
      method: "get",
      path: "/api/v1/exercises/categories",
      operationId: "exercises_list_categories",
      summary: "List Categories",
      ok: z.array(s.CategoryOut),
      handler: async (i) => catalog.categories(actor(i)),
    }),
    endpoint({
      ...exercises,
      method: "get",
      path: "/api/v1/exercises",
      operationId: "exercises_list_exercises",
      summary: "List Exercises",
      query: z.object({
        search: z.union([z.string(), z.null()]).optional(),
        category_id: z.union([z.string().uuid(), z.null()]).optional(),
        favorites_only: booleanQuery(false).optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50).optional(),
        offset: integerParam({ min: 0 })
          .default(0)
          .optional()
          .openapi({ default: 0 } as never),
      }),
      ok: s.ExerciseListPage,
      handler: async (i) =>
        catalog.list(
          actor(i),
          nullableString(i.query.search),
          nullableString(i.query.category_id),
          boolean(i.query.favorites_only),
          number(i.query.limit, 50),
          number(i.query.offset, 0),
        ),
    }),
    endpoint({
      ...exercises,
      method: "get",
      path: "/api/v1/exercises/{exercise_id}",
      operationId: "exercises_get_exercise",
      summary: "Get Exercise",
      params: z.object({ exercise_id: z.string().uuid() }),
      ok: s.ExerciseOut,
      handler: async (i) => catalog.get(actor(i), id(i, "exercise_id")),
    }),
    endpoint({
      ...exercises,
      method: "post",
      path: "/api/v1/exercises",
      operationId: "exercises_create_exercise",
      summary: "Create Exercise",
      body: s.ExerciseCreateRequest,
      status: 201,
      ok: s.ExerciseOut,
      handler: async (input) => {
        return catalog.create(actor(input), {
          name: input.body.name,
          category_id: input.body.category_id,
          difficulty: input.body.difficulty,
          description: input.body.description ?? "",
          steps: input.body.steps ?? [],
          alt_names: input.body.alt_names ?? [],
          contraindications: input.body.contraindications ?? null,
        });
      },
    }),
    endpoint({
      ...exercises,
      method: "patch",
      path: "/api/v1/exercises/{exercise_id}",
      operationId: "exercises_update_exercise",
      summary: "Update Exercise",
      params: z.object({ exercise_id: z.string().uuid() }),
      body: s.ExerciseUpdateRequest,
      ok: s.ExerciseOut,
      handler: async (input) => {
        return catalog.update(actor(input), id(input, "exercise_id"), {
          name: input.body.name ?? undefined,
          category_id: input.body.category_id ?? undefined,
          difficulty: input.body.difficulty ?? undefined,
          description: input.body.description ?? undefined,
          steps: input.body.steps ?? undefined,
          alt_names: input.body.alt_names ?? undefined,
          contraindications: input.body.contraindications ?? undefined,
        });
      },
    }),
    endpoint({
      ...exercises,
      method: "delete",
      path: "/api/v1/exercises/{exercise_id}",
      operationId: "exercises_delete_exercise",
      summary: "Delete Exercise",
      params: z.object({ exercise_id: z.string().uuid() }),
      status: 204,
      handler: async (i) => catalog.remove(actor(i), id(i, "exercise_id")),
    }),
    endpoint({
      ...exercises,
      method: "put",
      path: "/api/v1/exercises/{exercise_id}/favorite",
      operationId: "exercises_set_favorite",
      summary: "Set Favorite",
      query: z.object({ is_favorite: booleanQuery() }),
      params: z.object({ exercise_id: z.string().uuid() }),
      ok: s.ExerciseListItem,
      handler: async (i) =>
        catalog.favorite(actor(i), id(i, "exercise_id"), boolean(i.query.is_favorite)),
    }),
    endpoint({
      ...exercises,
      method: "post",
      path: "/api/v1/exercises/{exercise_id}/media/link",
      operationId: "exercises_add_exercise_media_link",
      summary: "Add Exercise Media Link",
      params: z.object({ exercise_id: z.string().uuid() }),
      body: s.ExerciseMediaLinkRequest,
      status: 201,
      ok: s.ExerciseMediaOut,
      handler: async (input) => {
        return catalog.link(actor(input), id(input, "exercise_id"), {
          kind: input.body.kind,
          url: input.body.url,
          position: input.body.position ?? 0,
        });
      },
    }),
    endpoint({
      ...exercises,
      method: "post",
      path: "/api/v1/exercises/{exercise_id}/media",
      operationId: "exercises_add_exercise_media",
      summary: "Add Exercise Media",
      params: z.object({ exercise_id: z.string().uuid() }),
      // A form, not JSON: `input.body` stays unknown and the handler parses it below.
      rawBody: {
        required: true,
        content: { "multipart/form-data": { schema: s.ExerciseMediaUpload } },
      },
      status: 201,
      ok: s.ExerciseMediaOut,
      handler: async (i) => {
        const b = mediaUpload.parse(i.body);
        return catalog.upload(
          actor(i),
          id(i, "exercise_id"),
          b.kind,
          new Uint8Array(await b.file.arrayBuffer()),
          b.file.type || "application/octet-stream",
        );
      },
    }),
    endpoint({
      ...exercises,
      method: "delete",
      path: "/api/v1/exercises/{exercise_id}/media/{media_id}",
      operationId: "exercises_delete_exercise_media",
      summary: "Delete Exercise Media",
      params: z.object({ exercise_id: z.string().uuid(), media_id: z.string().uuid() }),
      status: 204,
      handler: async (i) => catalog.removeMedia(actor(i), id(i, "exercise_id"), id(i, "media_id")),
    }),
  ];
}
