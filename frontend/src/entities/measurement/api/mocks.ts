import { HttpResponse, http } from 'msw';

import type { components } from '@/shared/api/schema';
import { env } from '@/shared/config/env';

type MeasurementOut = components['schemas']['MeasurementOut'];
type MeasurementCreate = components['schemas']['MeasurementCreate'];
type CustomFieldOut = components['schemas']['CustomFieldOut'];

const store = new Map<string, MeasurementOut>();
const customFields = new Map<number, CustomFieldOut>();

// Clears the in-memory mock state between tests (the maps live in module scope,
// so they would otherwise leak records across test cases).
export function resetMeasurementStore(): void {
  store.clear();
  customFields.clear();
}

// Seeds a custom measurement field so tests can render UI that depends on the
// user having configured custom fields (analytics chart constructor).
export function seedCustomField(field: CustomFieldOut): void {
  customFields.set(field.slot, field);
}

function toOut(body: MeasurementCreate): MeasurementOut {
  const id = body.id ?? globalThis.crypto.randomUUID();
  return {
    ...body,
    id,
    date: body.date,
    updated_at: new Date().toISOString(),
    photos: [],
  } as MeasurementOut;
}

const base = `${env.apiUrl}/api/v1/measurements`;

export const measurementHandlers = [
  http.get(base, () => HttpResponse.json({ items: [...store.values()], total: store.size })),

  http.post(base, async ({ request }) => {
    const body = (await request.json()) as MeasurementCreate;
    if (body.id && store.has(body.id)) {
      return HttpResponse.json(store.get(body.id), { status: 200 }); // idempotent replay
    }
    const clash = [...store.values()].find((m) => m.date === body.date);
    if (clash) {
      return HttpResponse.json(
        {
          code: 'measurement_date_conflict',
          message: 'A measurement for this date already exists',
          details: { existing_id: clash.id, date: body.date },
        },
        { status: 409 },
      );
    }
    const out = toOut(body);
    store.set(out.id, out);
    return HttpResponse.json(out, { status: 201 });
  }),

  http.get(`${base}/custom-fields`, () => HttpResponse.json([...customFields.values()])),

  http.put(`${base}/custom-fields/:slot`, async ({ params, request }) => {
    const slot = Number(params.slot);
    const body = (await request.json()) as { name: string; unit: string };
    const field: CustomFieldOut = { slot, name: body.name, unit: body.unit };
    customFields.set(slot, field);
    return HttpResponse.json(field);
  }),

  http.get(`${base}/:id`, ({ params }) => {
    const found = store.get(String(params.id));
    return found
      ? HttpResponse.json(found)
      : HttpResponse.json(
          { code: 'not_found', message: 'Not found', details: null },
          { status: 404 },
        );
  }),

  http.put(`${base}/:id`, async ({ params, request }) => {
    const body = (await request.json()) as MeasurementCreate;
    const out = { ...toOut(body), id: String(params.id) };
    store.set(out.id, out);
    return HttpResponse.json(out);
  }),

  http.delete(`${base}/:id`, ({ params }) => {
    store.delete(String(params.id));
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${base}/:id/photos`, async ({ params, request }) => {
    // Parse the multipart body by hand: undici's request.formData() rejects the
    // File part reconstructed across the jsdom/undici boundary in the test env.
    const raw = await request.text();
    const kind = /name="kind"\r?\n\r?\n([^\r\n]+)/.exec(raw)?.[1] ?? '';
    return HttpResponse.json(
      { kind, url: `/api/v1/measurements/${params.id}/photos/${kind}/content` },
      { status: 201 },
    );
  }),

  http.get(`${base}/:id/photos/:kind/content`, () =>
    new HttpResponse(
      Uint8Array.from(
        atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/Z9sAAAAASUVORK5CYII='),
        (char) => char.charCodeAt(0),
      ),
      { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, no-store' } },
    ),
  ),

  http.delete(`${base}/:id/photos/:kind`, () => new HttpResponse(null, { status: 204 })),
];
