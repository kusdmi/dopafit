import { HttpResponse, http } from 'msw';

import type { components } from '@/shared/api/schema';
import { env } from '@/shared/config/env';

type EventOut = components['schemas']['EventOut'];
type EventClientOut = components['schemas']['EventClientOut'];
type MonthStats = components['schemas']['MonthStats'];
type EventCreateRequest = components['schemas']['EventCreateRequest'];
type EventUpdateRequest = components['schemas']['EventUpdateRequest'];

const store = new Map<string, EventOut>();

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function resetCalendarStore(): void {
  store.clear();
  seed();
}

function seed(): void {
  // Anchor seed events to the current month/year so "today" highlighting and the
  // month query stay deterministic relative to whatever clock the test sets.
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const iso = (day: number) => `${y}-${pad(m)}-${pad(day)}`;

  const personal: EventOut = {
    id: 'event-personal-1',
    owner_name: 'Вы',
    program_id: null,
    program_name: null,
    date: iso(10),
    time: '09:00',
    type: 'personal',
    status: 'planned',
    workout_session_id: null,
    clients: [],
  };
  const withClients: EventOut = {
    id: 'event-with-clients-1',
    owner_name: 'Тренер',
    program_id: null,
    program_name: null,
    date: iso(15),
    time: '12:00',
    type: 'with_clients',
    status: 'completed',
    workout_session_id: null,
    clients: [{ client_id: 'client-stub-1', name: 'Вася' }],
  };
  const cancelled: EventOut = {
    id: 'event-cancelled-1',
    owner_name: 'Вы',
    program_id: null,
    program_name: null,
    date: iso(20),
    time: '18:00',
    type: 'personal',
    status: 'cancelled',
    workout_session_id: null,
    clients: [],
  };
  store.set(personal.id, personal);
  store.set(withClients.id, withClients);
  store.set(cancelled.id, cancelled);
}

seed();

function computeStats(events: EventOut[]): MonthStats {
  const uniqueClients = new Set<string>();
  let personal = 0;
  let withClients = 0;
  let planned = 0;
  let completed = 0;
  for (const e of events) {
    if (e.status === 'cancelled') continue;
    if (e.type === 'personal') personal += 1;
    else withClients += 1;
    if (e.status === 'planned') planned += 1;
    else if (e.status === 'completed') completed += 1;
    for (const c of e.clients) uniqueClients.add(c.client_id);
  }
  return {
    personal,
    with_clients: withClients,
    planned,
    completed,
    unique_clients: uniqueClients.size,
  };
}

const base = env.apiUrl;

export const calendarHandlers = [
  http.get(`${base}/api/v1/calendar/month`, ({ request }) => {
    const url = new URL(request.url);
    const year = Number(url.searchParams.get('year'));
    const month = Number(url.searchParams.get('month'));
    const prefix = `${year}-${pad(month)}`;
    // Отменённые НЕ прячем: реальный /calendar/month отдаёт их вместе с
    // остальными (строка события остаётся в базе), но счётчики считают только
    // активные записи. Мок раньше фильтровал их сам и расходился с сервером —
    // из-за этого баг «отменённая тренировка остаётся точкой на дне» не
    // воспроизводился в тестах.
    const events = [...store.values()].filter((e) => e.date.slice(0, 7) === prefix);
    return HttpResponse.json({ year, month, events, stats: computeStats(events) });
  }),
  http.post(`${base}/api/v1/calendar/events`, async ({ request }) => {
    const body = (await request.json()) as EventCreateRequest;
    const clientIds = body.client_ids ?? [];
    const clients: EventClientOut[] = clientIds.map((id, i) => {
      const known = store.get(id);
      const name = known?.clients.find((c) => c.client_id === id)?.name ?? `Клиент ${i + 1}`;
      return { client_id: id, name };
    });
    const created: EventOut = {
      id: globalThis.crypto.randomUUID(),
      owner_name: clientIds.length > 0 ? 'Тренер' : 'Вы',
      program_id: body.program_id ?? null,
      program_name: body.program_id ? 'Программа' : null,
      date: body.date,
      time: body.time,
      type: clientIds.length > 0 ? 'with_clients' : 'personal',
      status: 'planned',
      workout_session_id: null,
      clients,
    };
    store.set(created.id, created);
    return HttpResponse.json(created, { status: 201 });
  }),
  http.put(`${base}/api/v1/calendar/events/:eventId`, async ({ params, request }) => {
    const event = store.get(params.eventId as string);
    if (!event) return new HttpResponse(null, { status: 404 });
    const body = (await request.json()) as EventUpdateRequest;
    const updated: EventOut = {
      ...event,
      program_id: body.program_id === undefined ? event.program_id : body.program_id,
      program_name: body.program_id === undefined ? event.program_name : body.program_id ? 'Программа' : null,
      date: body.date ?? event.date,
      time: body.time ?? event.time,
      status: body.status ?? event.status,
    };
    store.set(event.id, updated);
    return HttpResponse.json(updated);
  }),
  http.delete(`${base}/api/v1/calendar/events/:eventId`, ({ params }) => {
    const event = store.get(params.eventId as string);
    if (!event) return new HttpResponse(null, { status: 404 });
    store.set(event.id, { ...event, status: 'cancelled' });
    return new HttpResponse(null, { status: 204 });
  }),
];
