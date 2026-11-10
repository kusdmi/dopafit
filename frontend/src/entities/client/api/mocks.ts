import { HttpResponse, http } from 'msw';

import type { components } from '@/shared/api/schema';
import { env } from '@/shared/config/env';

type ClientOut = components['schemas']['ClientOut'];
type ClientDetailOut = components['schemas']['ClientDetailOut'];
type ClientCreateRequest = components['schemas']['ClientCreateRequest'];
type ClientUpdateRequest = components['schemas']['ClientUpdateRequest'];
type ClientTrainerFieldsUpdateRequest = components['schemas']['ClientTrainerFieldsUpdateRequest'];
type MyTrainerOut = components['schemas']['MyTrainerOut'];

// Store keeps the detail shape (superset of ClientOut) so the GET /:id handler can
// return injuries; the list handler projects to ClientOut (drops injuries).
const store = new Map<string, ClientDetailOut>();

// The client's own side of the relationship, independent of the trainer's roster above:
// GET /clients answers a trainer, GET /clients/my-trainer answers a client. Tests that need
// the linked state call setMyTrainer; the default is "no trainer yet", the state the
// «Мой тренер» screen starts from.
let myTrainer: MyTrainerOut | null = null;

export function setMyTrainer(trainer: MyTrainerOut | null): void {
  myTrainer = trainer;
}

export function resetClientStore(): void {
  store.clear();
  myTrainer = null;
  seed();
}

function seed(): void {
  const stub: ClientDetailOut = {
    id: 'client-stub-1',
    client_user_id: null,
    display_name: 'Вася',
    full_name: 'Вася',
    phone: '+79991112233',
    status: 'active',
    start_date: '2026-01-10',
    end_date: null,
    workout_count: 3,
    last_activity_at: '2026-06-15T10:00:00Z',
    has_injuries: true,
    injuries: 'Грыжа L4-L5, ограничение по осевой нагрузке',
    note: 'Стесняется камеры',
  };
  const linked: ClientDetailOut = {
    id: 'client-linked-1',
    client_user_id: 'user-42',
    display_name: 'Анна Клиентова',
    full_name: 'Анна Клиентова',
    phone: '+79994445566',
    status: 'active',
    start_date: '2026-02-01',
    end_date: null,
    workout_count: 7,
    last_activity_at: '2026-06-17T09:00:00Z',
    has_injuries: false,
    injuries: null,
    note: null,
  };
  store.set(stub.id, stub);
  store.set(linked.id, linked);
}

seed();

function toListItem(c: ClientDetailOut): ClientOut {
  // List endpoint returns ClientOut (no `injuries` text, only the `has_injuries` flag).
  const { injuries, ...rest } = c;
  void injuries;
  return rest;
}

function listOut() {
  const items = [...store.values()].map(toListItem);
  const active = items.filter((c) => c.status === 'active').length;
  const workouts = items.reduce((s, c) => s + c.workout_count, 0);
  return { stats: { total: items.length, active, workouts }, items };
}

const base = env.apiUrl;

export const clientHandlers = [
  http.get(`${base}/api/v1/clients`, () => HttpResponse.json(listOut())),
  http.post(`${base}/api/v1/clients`, async ({ request }) => {
    const body = (await request.json()) as ClientCreateRequest;
    const id = globalThis.crypto.randomUUID();
    const created: ClientDetailOut = {
      id,
      client_user_id: null,
      display_name: body.display_name,
      full_name: body.display_name,
      phone: body.phone ?? null,
      status: 'active',
      start_date: body.start_date ?? '2026-06-18',
      end_date: null,
      workout_count: 0,
      last_activity_at: null,
      has_injuries: Boolean(body.injuries && body.injuries.trim()),
      injuries: body.injuries ?? null,
      note: body.note ?? null,
    };
    store.set(id, created);
    return HttpResponse.json(toListItem(created), { status: 201 });
  }),
  // Declared before /clients/:id — msw matches in order, and ":id" would otherwise
  // swallow the literal "my-trainer" segment.
  http.get(`${base}/api/v1/clients/my-trainer`, () => HttpResponse.json({ trainer: myTrainer })),
  http.get(`${base}/api/v1/clients/:id`, ({ params }) => {
    const c = store.get(params.id as string);
    return c ? HttpResponse.json(c) : new HttpResponse(null, { status: 404 });
  }),
  http.put(`${base}/api/v1/clients/:id`, async ({ params, request }) => {
    const c = store.get(params.id as string);
    if (!c) return new HttpResponse(null, { status: 404 });
    if (c.client_user_id !== null) {
      return HttpResponse.json(
        { code: 'forbidden', message: 'Linked clients cannot be edited' },
        { status: 403 },
      );
    }
    const body = (await request.json()) as ClientUpdateRequest;
    const injuries = body.injuries ?? c.injuries;
    const updated: ClientDetailOut = {
      ...c,
      display_name: body.display_name ?? c.display_name,
      full_name: body.display_name ?? c.full_name,
      phone: body.phone ?? c.phone,
      start_date: body.start_date ?? c.start_date,
      end_date: body.end_date ?? c.end_date,
      injuries,
      has_injuries: Boolean(injuries && injuries.trim()),
    };
    store.set(c.id, updated);
    return HttpResponse.json(toListItem(updated));
  }),
  http.patch(`${base}/api/v1/clients/:id/trainer-fields`, async ({ params, request }) => {
    const c = store.get(params.id as string);
    if (!c) return new HttpResponse(null, { status: 404 });
    const body = (await request.json()) as ClientTrainerFieldsUpdateRequest;
    const updated: ClientDetailOut = {
      ...c,
      note: body.note ?? c.note,
    };
    store.set(c.id, updated);
    return HttpResponse.json(updated);
  }),
  http.post(`${base}/api/v1/clients/:id/unlink`, ({ params }) => {
    const c = store.get(params.id as string);
    if (!c) return new HttpResponse(null, { status: 404 });
    store.set(c.id, { ...c, status: 'unlinked' });
    // The server reads the trainer from the card status, so an unlinked card leaves the
    // client with no trainer; the mock mirrors that instead of keeping a stale one.
    if (myTrainer && c.client_user_id) myTrainer = null;
    return HttpResponse.json({ ok: true });
  }),
  http.post(`${base}/api/v1/clients/:id/archive`, ({ params }) => {
    const c = store.get(params.id as string);
    if (!c) return new HttpResponse(null, { status: 404 });
    store.set(c.id, { ...c, status: 'archived' });
    return HttpResponse.json({ ok: true });
  }),
  http.post(`${base}/api/v1/clients/:id/unarchive`, ({ params }) => {
    const c = store.get(params.id as string);
    if (!c) return new HttpResponse(null, { status: 404 });
    store.set(c.id, { ...c, status: 'active' });
    return HttpResponse.json({ ok: true });
  }),
];
