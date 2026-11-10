import { HttpResponse, http } from 'msw';

import type { components } from '@/shared/api/schema';
import { env } from '@/shared/config/env';

type ExerciseOut = components['schemas']['ExerciseOut'];
type ExerciseListItem = components['schemas']['ExerciseListItem'];
type CategoryOut = components['schemas']['CategoryOut'];

const categories: CategoryOut[] = [
  { id: 'cat-chest', slug: 'chest', name: 'Грудь', emoji: '💪', image_url: null, exercise_count: 2 },
  { id: 'cat-back', slug: 'back', name: 'Спина', emoji: '🔙', image_url: null, exercise_count: 2 },
  { id: 'cat-legs', slug: 'legs', name: 'Ноги', emoji: '🦵', image_url: null, exercise_count: 2 },
  { id: 'cat-shoulders', slug: 'shoulders', name: 'Плечи', emoji: '🤷', image_url: null, exercise_count: 2 },
  { id: 'cat-arms', slug: 'arms', name: 'Руки', emoji: '💪', image_url: null, exercise_count: 2 },
  { id: 'cat-abs', slug: 'abs', name: 'Пресс', emoji: '🔥', image_url: null, exercise_count: 3 },
];

const favorites = new Set<string>();

function seed(): ExerciseOut[] {
  return [
    mk('ex-1', 'Жим штанги лёжа', 'cat-chest', 'intermediate', ['противопоказано при травме плеча']),
    mk('ex-2', 'Отжимания', 'cat-chest', 'beginner', null),
    mk('ex-3', 'Подтягивания', 'cat-back', 'advanced', null),
    mk('ex-4', 'Тяга штанги в наклоне', 'cat-back', 'intermediate', null),
    mk('ex-5', 'Приседания со штангой', 'cat-legs', 'advanced', ['осторожно при проблемах с коленями']),
    mk('ex-6', 'Выпады', 'cat-legs', 'beginner', null),
    mk('ex-7', 'Жим гантелей сидя', 'cat-shoulders', 'intermediate', null),
    mk('ex-8', 'Махи гантелями в стороны', 'cat-shoulders', 'beginner', null),
    mk('ex-9', 'Подъём штанги на бицепс', 'cat-arms', 'beginner', null),
    mk('ex-10', 'Французский жим', 'cat-arms', 'intermediate', null),
    mk('ex-11', 'Скручивания', 'cat-abs', 'beginner', null),
    mk('ex-12', 'Планка', 'cat-abs', 'beginner', null),
    mk('ex-13', 'Подъём ног в висе', 'cat-abs', 'advanced', null),
  ];
}

let exercises: ExerciseOut[] = seed();

function mk(
  id: string,
  name: string,
  category_id: string,
  difficulty: ExerciseOut['difficulty'],
  contraindications: string[] | null,
): ExerciseOut {
  return {
    id,
    name,
    category_id,
    difficulty,
    alt_names: [],
    description: `Описание упражнения «${name}».`,
    steps: ['Примите исходное положение.', 'Выполните движение.', 'Вернитесь в исходное положение.'],
    contraindications: contraindications ? contraindications.join('; ') : null,
    image_url: null,
    is_favorite: false,
    ownership: 'global',
    media: [],
  };
}

export function resetExerciseStore(): void {
  favorites.clear();
  exercises = seed();
}

function toListItem(e: ExerciseOut): ExerciseListItem {
  return {
    id: e.id,
    name: e.name,
    category_id: e.category_id,
    difficulty: e.difficulty,
    is_favorite: favorites.has(e.id),
    ownership: e.ownership,
  };
}

const base = `${env.apiUrl}/api/v1/exercises`;

export const exerciseHandlers = [
  http.get(`${base}/categories`, () => HttpResponse.json(categories)),

  http.get(base, ({ request }) => {
    const url = new URL(request.url);
    const search = (url.searchParams.get('search') ?? '').toLowerCase();
    const categoryId = url.searchParams.get('category_id');
    const favoritesOnly = url.searchParams.get('favorites_only') === 'true';
    let items = exercises.map(toListItem);
    if (search) items = items.filter((e) => e.name.toLowerCase().includes(search));
    if (categoryId) items = items.filter((e) => e.category_id === categoryId);
    if (favoritesOnly) items = items.filter((e) => e.is_favorite);
    const offset = Number(url.searchParams.get('offset') ?? 0);
    const limit = Number(url.searchParams.get('limit') ?? 50);
    return HttpResponse.json({ items: items.slice(offset, offset + limit), total: items.length });
  }),

  http.get(`${base}/:id`, ({ params }) => {
    const found = exercises.find((e) => e.id === String(params.id));
    return found
      ? HttpResponse.json({ ...found, is_favorite: favorites.has(found.id) })
      : HttpResponse.json({ code: 'not_found', message: 'Not found', details: null }, { status: 404 });
  }),

  // Real contract: is_favorite is a query param, not a request body.
  http.put(`${base}/:id/favorite`, ({ params, request }) => {
    const id = String(params.id);
    const url = new URL(request.url);
    const isFavorite = url.searchParams.get('is_favorite') === 'true';
    if (isFavorite) favorites.add(id);
    else favorites.delete(id);
    const found = exercises.find((e) => e.id === id);
    return HttpResponse.json({
      id,
      name: found?.name ?? '',
      category_id: found?.category_id ?? '',
      difficulty: found?.difficulty ?? 'beginner',
      is_favorite: isFavorite,
      ownership: found?.ownership ?? 'global',
    } satisfies ExerciseListItem);
  }),

  http.post(base, async ({ request }) => {
    const body = (await request.json()) as {
      name: string;
      category_id: string;
      difficulty: ExerciseOut['difficulty'];
    };
    const id = globalThis.crypto.randomUUID();
    const created: ExerciseOut = {
      id,
      name: body.name,
      category_id: body.category_id,
      difficulty: body.difficulty,
      alt_names: [],
      description: '',
      steps: [],
      contraindications: null,
      image_url: null,
      is_favorite: false,
      ownership: 'own',
      media: [],
    };
    exercises.push(created);
    return HttpResponse.json(created, { status: 201 });
  }),

  http.patch(`${base}/:id`, async ({ params, request }) => {
    const patch = (await request.json()) as Partial<ExerciseOut>;
    const ex = exercises.find((e) => e.id === String(params.id));
    if (!ex) {
      return HttpResponse.json({ code: 'not_found', message: 'Not found', details: null }, { status: 404 });
    }
    Object.assign(ex, patch, { ownership: 'own' });
    return HttpResponse.json(ex);
  }),

  http.delete(`${base}/:id`, ({ params }) => {
    const i = exercises.findIndex((e) => e.id === String(params.id));
    if (i >= 0) exercises.splice(i, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${base}/:id/media/link`, async ({ request }) => {
    const body = (await request.json()) as { kind: string; url: string; position: number };
    return HttpResponse.json(
      {
        id: globalThis.crypto.randomUUID(),
        kind: body.kind,
        url: body.url,
        position: body.position,
      },
      { status: 201 },
    );
  }),

  http.delete(`${base}/:id/media/:mediaId`, () => new HttpResponse(null, { status: 204 })),
];
