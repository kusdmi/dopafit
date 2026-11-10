import { z } from "@hono/zod-openapi";
import type { MeasurementApplication } from "../application/measurements.js";
import type * as M from "../domain/models/index.js";
import * as s from "./schemas.js";
import { actor, id, nullableString, number, photoUpload } from "./shared.js";
import {
  binaryEndpoint,
  endpoint,
  endpointResponse,
  integerParam,
  type Endpoint,
  type EndpointPolicy,
} from "../../../endpoint.js";

/** Maps a measurement request body onto the domain draft shape, used by both create and update. */
function measurement(b: z.infer<typeof s.MeasurementCreate>): M.MeasurementDraft {
  return {
    id: b.id ?? null,
    date: b.date,
    custom_values: (b.custom_values ?? []).map((v) => ({
      slot: v.slot,
      name: v.name,
      unit: v.unit,
      value: v.value,
    })),
    height: b.height ?? null,
    weight: b.weight ?? null,
    waist: b.waist ?? null,
    chest: b.chest ?? null,
    hips: b.hips ?? null,
    thigh: b.thigh ?? null,
    shoulder: b.shoulder ?? null,
    ankle: b.ankle ?? null,
    calf: b.calf ?? null,
    biceps: b.biceps ?? null,
    forearm: b.forearm ?? null,
    wrist: b.wrist ?? null,
    neck: b.neck ?? null,
  };
}

/**
 * Every operation here is behind a token, and each can refuse a client whose card is not the
 * caller's — so all five failures apply throughout.
 */
const measurementsPolicy = {
  security: [{ HTTPBearer: [] }],
  tags: ["measurements"],
  errors: [401, 403, 404, 409, 422],
} satisfies EndpointPolicy;

/**
 * Anthropometry measurements, their custom fields and progress photos.
 *
 * Each entry pairs the route with the handler that implements it, so an operationId, a path
 * and a body schema are named once and cannot drift between two files.
 */
export function measurementsEndpoints(measurements: MeasurementApplication): Endpoint[] {
  return [
    endpoint({
      ...measurementsPolicy,
      method: "get",
      path: "/api/v1/measurements",
      operationId: "measurements_list_measurements",
      summary: "List Measurements",
      query: z.object({
        limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
        offset: integerParam({ min: 0 })
          .default(0)
          .optional()
          .openapi({ default: 0 } as never),
        client_id: z.union([z.string().uuid(), z.null()]).optional(),
      }),
      ok: s.MeasurementPage,
      handler: async (i) =>
        measurements.list(
          actor(i),
          nullableString(i.query.client_id),
          number(i.query.limit, 20),
          number(i.query.offset, 0),
        ),
    }),
    endpoint({
      ...measurementsPolicy,
      method: "get",
      path: "/api/v1/measurements/{measurement_id}",
      operationId: "measurements_get_measurement",
      summary: "Get Measurement",
      params: z.object({ measurement_id: z.string().uuid() }),
      ok: s.MeasurementOut,
      handler: async (i) => measurements.get(actor(i), id(i, "measurement_id")),
    }),
    endpoint({
      ...measurementsPolicy,
      method: "post",
      path: "/api/v1/measurements",
      operationId: "measurements_create_measurement",
      summary: "Create Measurement",
      body: s.MeasurementCreate,
      ok: s.MeasurementOut,
      created: { schema: s.MeasurementOut, description: "Measurement created" },
      handler: async (input) => {
        const result = await measurements.create(actor(input), measurement(input.body));
        return endpointResponse(result.value, result.created ? 201 : 200);
      },
    }),
    endpoint({
      ...measurementsPolicy,
      method: "put",
      path: "/api/v1/measurements/{measurement_id}",
      operationId: "measurements_update_measurement",
      summary: "Update Measurement",
      params: z.object({ measurement_id: z.string().uuid() }),
      body: s.MeasurementCreate,
      ok: s.MeasurementOut,
      handler: async (input) =>
        measurements.update(actor(input), id(input, "measurement_id"), measurement(input.body)),
    }),
    endpoint({
      ...measurementsPolicy,
      method: "delete",
      path: "/api/v1/measurements/{measurement_id}",
      operationId: "measurements_delete_measurement",
      summary: "Delete Measurement",
      params: z.object({ measurement_id: z.string().uuid() }),
      status: 204,
      handler: async (i) => measurements.remove(actor(i), id(i, "measurement_id")),
    }),
    endpoint({
      ...measurementsPolicy,
      method: "get",
      path: "/api/v1/measurements/custom-fields",
      operationId: "measurements_list_custom_fields",
      summary: "List Custom Fields",
      description:
        "List custom measurement field definitions.\n\nWithout *client_id* returns the authenticated user's own fields.\nWith *client_id* (a TrainerClient card UUID) returns the linked client's\nfields; the caller must be the card's owning trainer and the card must have\na real linked account (stubs return an empty list).\nPeriod logic is not applied — custom fields are configuration, not time-\nstamped entities.",
      query: z.object({ client_id: z.union([z.string().uuid(), z.null()]).optional() }),
      ok: z.array(s.CustomFieldOut),
      handler: async (i) => measurements.fields(actor(i), nullableString(i.query.client_id)),
    }),
    endpoint({
      ...measurementsPolicy,
      method: "put",
      path: "/api/v1/measurements/custom-fields/{slot}",
      operationId: "measurements_update_custom_field",
      summary: "Update Custom Field",
      params: z.object({ slot: integerParam() }),
      body: s.CustomFieldUpdateRequest,
      ok: s.CustomFieldOut,
      handler: async (input) => {
        return measurements.setField(actor(input), {
          slot: z.coerce.number().int().parse(input.params.slot),
          name: input.body.name,
          unit: input.body.unit,
        });
      },
    }),
    endpoint({
      ...measurementsPolicy,
      method: "post",
      path: "/api/v1/measurements/{measurement_id}/photos",
      operationId: "measurements_upload_photo",
      summary: "Upload Photo",
      params: z.object({ measurement_id: z.string().uuid() }),
      // A form, not JSON: `input.body` stays unknown and the handler parses it below.
      rawBody: {
        required: true,
        content: { "multipart/form-data": { schema: s.MeasurementPhotoUpload } },
      },
      status: 201,
      ok: s.MeasurementPhotoOut,
      handler: async (i) => {
        const b = photoUpload.parse(i.body);
        return measurements.upload(
          actor(i),
          id(i, "measurement_id"),
          b.kind,
          new Uint8Array(await b.file.arrayBuffer()),
          b.file.type || "application/octet-stream",
        );
      },
    }),
    binaryEndpoint({
      ...measurementsPolicy,
      method: "get",
      path: "/api/v1/measurements/{measurement_id}/photos/{kind}/content",
      operationId: "measurements_get_photo_content",
      summary: "Get Private Photo",
      params: z.object({ measurement_id: z.string().uuid(), kind: s.PhotoKind }),
      contentTypes: ["image/jpeg", "image/png", "image/webp"],
      handler: async (i) => {
        const photo = await measurements.photo(
          actor(i),
          id(i, "measurement_id"),
          s.PhotoKind.parse(i.params.kind),
        );
        return new Response(Buffer.from(photo.data), {
          status: 200,
          headers: { "Content-Type": photo.contentType, "Cache-Control": "private, no-store" },
        });
      },
    }),
    endpoint({
      ...measurementsPolicy,
      method: "delete",
      path: "/api/v1/measurements/{measurement_id}/photos/{kind}",
      operationId: "measurements_delete_photo",
      summary: "Delete Photo",
      params: z.object({ measurement_id: z.string().uuid(), kind: s.PhotoKind }),
      status: 204,
      handler: async (i) =>
        measurements.removePhoto(
          actor(i),
          id(i, "measurement_id"),
          s.PhotoKind.parse(i.params.kind),
        ),
    }),
  ];
}
