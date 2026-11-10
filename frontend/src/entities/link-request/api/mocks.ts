import { HttpResponse, http } from 'msw';

import type { components } from '@/shared/api/schema';
import { env } from '@/shared/config/env';

type LinkRequestOut = components['schemas']['LinkRequestOut'];
type CreateBody = components['schemas']['LinkRequestCreateRequest'];

const store = new Map<string, LinkRequestOut>();

export function resetLinkRequestStore(): void {
  store.clear();
  seed();
}

function seed(): void {
  const incoming: LinkRequestOut = {
    id: 'lr-incoming-1',
    direction: 'incoming',
    counterpart: { user_id: 'user-7', name: 'Вася Клиент', role: 'client' },
    status: 'pending',
    created_at: '2026-06-16T08:00:00Z',
  };
  const outgoing: LinkRequestOut = {
    id: 'lr-outgoing-1',
    direction: 'outgoing',
    counterpart: { user_id: 'user-8', name: 'Пётр Тренер', role: 'trainer' },
    status: 'pending',
    created_at: '2026-06-15T08:00:00Z',
  };
  store.set(incoming.id, incoming);
  store.set(outgoing.id, outgoing);
}

seed();

const base = env.apiUrl;

export const linkRequestHandlers = [
  http.get(`${base}/api/v1/link-requests`, ({ request }) => {
    const dir = new URL(request.url).searchParams.get('direction');
    const items = [...store.values()].filter((r) => !dir || r.direction === dir);
    return HttpResponse.json(items);
  }),
  http.post(`${base}/api/v1/link-requests`, async ({ request }) => {
    const body = (await request.json()) as CreateBody;
    if (!body.query) {
      return HttpResponse.json(
        { code: 'validation_error', message: 'query required' },
        { status: 422 },
      );
    }
    const id = globalThis.crypto.randomUUID();
    const created: LinkRequestOut = {
      id,
      direction: 'outgoing',
      counterpart: { user_id: body.query, name: body.query, role: 'trainer' },
      status: 'pending',
      created_at: new Date().toISOString(),
    };
    store.set(id, created);
    return HttpResponse.json(created, { status: 201 });
  }),
  http.post(`${base}/api/v1/link-requests/:id/accept`, ({ params }) => {
    const r = store.get(params.id as string);
    if (!r) return new HttpResponse(null, { status: 404 });
    const updated = { ...r, status: 'accepted' as const };
    store.set(r.id, updated);
    return HttpResponse.json(updated);
  }),
  http.post(`${base}/api/v1/link-requests/:id/decline`, ({ params }) => {
    const r = store.get(params.id as string);
    if (!r) return new HttpResponse(null, { status: 404 });
    const updated = { ...r, status: 'declined' as const };
    store.set(r.id, updated);
    return HttpResponse.json(updated);
  }),
  http.delete(`${base}/api/v1/link-requests/:id`, ({ params }) => {
    const r = store.get(params.id as string);
    if (!r) return new HttpResponse(null, { status: 404 });
    store.delete(r.id);
    return new HttpResponse(null, { status: 204 });
  }),
];
