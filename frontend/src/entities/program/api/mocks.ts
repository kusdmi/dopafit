import { HttpResponse, http } from 'msw';

import type { components } from '@/shared/api/schema';
import { env } from '@/shared/config/env';

type ProgramOut = components['schemas']['ProgramOut'];
type ProgramListItem = components['schemas']['ProgramListItem'];
type ProgramCreate = components['schemas']['ProgramCreate'];
type AddExerciseToProgramRequest = components['schemas']['AddExerciseToProgramRequest'];

const store = new Map<string, ProgramOut>();

function seedStandard(id: string, name: string, kind: ProgramOut['kind']): ProgramOut {
  return {
    id,
    name,
    kind,
    is_standard: true,
    source_author_name: null,
    updated_at: new Date().toISOString(),
    days: [
      {
        id: `${id}-d1`,
        name: 'День 1',
        position: 0,
        slots: [
          {
            id: `${id}-s1`,
            position: 0,
            exercises: [
              {
                id: `${id}-se1`,
                exercise_id: null,
                name: 'Приседания',
                sets: 4,
                reps: 10,
                variant_order: 0,
                has_contraindications: false,
              },
            ],
          },
        ],
      },
    ],
  };
}

const standard: ProgramOut[] = [
  seedStandard('std-strength', 'Силовая', 'strength'),
  seedStandard('std-functional', 'Функциональная', 'functional'),
  seedStandard('std-cardio', 'Кардио', 'cardio'),
  seedStandard('std-plyo', 'Плиометрическая', 'plyometric'),
];

// Clears the in-memory mock state between tests.
export function resetProgramStore(): void {
  store.clear();
}

function countExercises(p: ProgramOut): number {
  return p.days.reduce(
    (sum, d) =>
      sum + d.slots.filter((s) => s.exercises.some((e) => e.variant_order === 0)).length,
    0,
  );
}

function toListItem(
  p: ProgramOut,
  forClient?: { id: string; name: string },
): ProgramListItem {
  return {
    id: p.id,
    name: p.name,
    kind: p.kind,
    is_standard: p.is_standard,
    updated_at: p.updated_at,
    day_count: p.days.length,
    exercise_count: countExercises(p),
    // Trainer share-copies "for a client" carry the client identity; own/standard
    // programs (and everything a client sees) have these null.
    for_client_id: forClient?.id ?? null,
    for_client_name: forClient?.name ?? null,
  };
}

function fromCreate(body: ProgramCreate): ProgramOut {
  const id = body.id ?? globalThis.crypto.randomUUID();
  return {
    id,
    name: body.name,
    kind: body.kind,
    is_standard: false,
    source_author_name: null,
    updated_at: new Date().toISOString(),
    days: body.days.map((d) => {
      return {
        id: d.id ?? globalThis.crypto.randomUUID(),
        name: d.name,
        position: d.position,
        slots: d.slots.map((s) => {
          return {
            id: s.id ?? globalThis.crypto.randomUUID(),
            position: s.position,
            exercises: s.exercises.map((e) => {
              return {
                id: e.id ?? globalThis.crypto.randomUUID(),
                exercise_id: e.exercise_id ?? null,
                name: e.custom_name ?? 'Упражнение',
                sets: e.sets,
                reps: e.reps,
                variant_order: e.variant_order,
                has_contraindications: false,
              };
            }),
          };
        }),
      };
    }),
  };
}

const base = `${env.apiUrl}/api/v1/programs`;

export const programHandlers = [
  // GET /programs → ProgramListItem[] array (real contract)
  http.get(base, () =>
    HttpResponse.json([...standard, ...store.values()].map((p) => toListItem(p))),
  ),

  http.post(base, async ({ request }) => {
    const body = (await request.json()) as ProgramCreate;
    if (body.id && standard.find((p) => p.id === body.id)) {
      return HttpResponse.json(
        { code: 'forbidden', message: 'Program belongs to another user', details: null },
        { status: 403 },
      );
    }
    if (body.id && store.has(body.id)) {
      return HttpResponse.json(store.get(body.id), { status: 200 });
    }
    const out = fromCreate(body);
    store.set(out.id, out);
    return HttpResponse.json(out, { status: 201 });
  }),

  http.get(`${base}/:id`, ({ params }) => {
    const id = String(params.id);
    const found = store.get(id) ?? standard.find((p) => p.id === id);
    return found
      ? HttpResponse.json(found)
      : HttpResponse.json({ code: 'not_found', message: 'Not found', details: null }, { status: 404 });
  }),

  http.put(`${base}/:id`, async ({ params, request }) => {
    const body = (await request.json()) as ProgramCreate;
    const out = { ...fromCreate(body), id: String(params.id) };
    store.set(out.id, out);
    return HttpResponse.json(out);
  }),

  http.delete(`${base}/:id`, ({ params }) => {
    store.delete(String(params.id));
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${base}/:id/exercises`, async ({ params, request }) => {
    const id = String(params.id);
    const body = (await request.json()) as AddExerciseToProgramRequest;
    let program = store.get(id);
    if (!program) {
      const found = standard.find((p) => p.id === id);
      if (!found) {
        return HttpResponse.json(
          { code: 'not_found', message: 'Not found', details: null },
          { status: 404 },
        );
      }
      program = structuredClone(found);
      store.set(id, program);
    }
    const day = program.days.find((d) => d.id === body.day_id);
    if (day) {
      // Idempotent by slot_id: if a slot with this id already exists, return unchanged.
      if (body.slot_id && day.slots.some((s) => s.id === body.slot_id)) {
        return HttpResponse.json(program);
      }
      day.slots.push({
        id: body.slot_id ?? globalThis.crypto.randomUUID(),
        position: day.slots.length,
        exercises: [
          {
            id: body.slot_exercise_id ?? globalThis.crypto.randomUUID(),
            exercise_id: body.exercise_id,
            name: 'Упражнение',
            sets: body.sets,
            reps: body.reps,
            variant_order: 0,
            has_contraindications: false,
          },
        ],
      });
    }
    return HttpResponse.json(program);
  }),

  http.post(`${base}/:id/share`, ({ params }) => {
    const id = String(params.id);
    const source = store.get(id) ?? standard.find((p) => p.id === id);
    if (!source) {
      return HttpResponse.json(
        { code: 'not_found', message: 'Not found', details: null },
        { status: 404 },
      );
    }
    const copy = {
      ...structuredClone(source),
      id: globalThis.crypto.randomUUID(),
      is_standard: false,
      source_author_name: source.source_author_name ?? 'Тренер',
    };
    store.set(copy.id, copy);
    return HttpResponse.json(toListItem(copy), { status: 200 });
  }),
];
