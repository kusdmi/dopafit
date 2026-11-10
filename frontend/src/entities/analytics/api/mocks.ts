import { HttpResponse, http } from 'msw';

import type { components } from '@/shared/api/schema';
import { env } from '@/shared/config/env';

type DashboardOut = components['schemas']['DashboardOut'];
type WorkoutSeriesByExerciseOut = components['schemas']['WorkoutSeriesByExerciseOut'];
type AnthropometrySeriesOut = components['schemas']['AnthropometrySeriesOut'];
type PhotoDatesOut = components['schemas']['PhotoDatesOut'];
type PhotoComparisonOut = components['schemas']['PhotoComparisonOut'];
type BodyParameter = components['schemas']['BodyParameter'];

const base = `${env.apiUrl}/api/v1/analytics`;

export function resetAnalyticsStore(): void {
  // stateless mocks; nothing to reset
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function weekFromToday(): DashboardOut['week'] {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return {
      date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      has_personal_workout: i === 1 || i === 3,
      has_client_workout: false,
    };
  });
}

const dashboard: DashboardOut = {
  full_name: 'Иван Иванов',
  week: weekFromToday(),
  month_workout_count: 8,
  personal_record: { exercise_id: 'ex-bench', exercise_name: 'Жим лёжа', weight: 100 },
  measurement_chart: {
    points: [
      { date: '2026-04-01', value: 82 },
      { date: '2026-05-01', value: 80 },
      { date: '2026-06-01', value: 78 },
    ],
    change_percent: -4.9,
  },
  strength_chart: {
    points: [
      { date: '2026-04-01', value: 90 },
      { date: '2026-05-01', value: 95 },
      { date: '2026-06-01', value: 100 },
    ],
    change_percent: 11.1,
  },
};

// Два упражнения, как на макете (Жим лёжа / Подтягивания): экран рисует по
// карточке на каждое, поэтому один элемент не показал бы главного — разбивки.
const workoutSeriesByExercise: WorkoutSeriesByExerciseOut = {
  exercises: [
    {
      exercise_id: 'ex-bench',
      name: 'Жим лёжа',
      points: [
        { date: '2026-05-01', weight: 70, reps: 10, sets: 3 },
        { date: '2026-05-08', weight: 72.5, reps: 9, sets: 3 },
        { date: '2026-05-15', weight: 75, reps: 8, sets: 4 },
      ],
      stats: { avg_weight: 72.5, avg_reps: 9, total_workouts: 3 },
    },
    {
      exercise_id: 'ex-pullups',
      name: 'Подтягивания',
      points: [
        { date: '2026-05-01', weight: 0, reps: 8, sets: 3 },
        { date: '2026-05-08', weight: 0, reps: 9, sets: 3 },
        { date: '2026-05-15', weight: 5, reps: 10, sets: 3 },
      ],
      stats: { avg_weight: 1.7, avg_reps: 9, total_workouts: 3 },
    },
  ],
};

type ParameterSeries = AnthropometrySeriesOut['parameters'][number];

function seriesFromValues(
  identity: Pick<ParameterSeries, 'parameter' | 'custom_slot' | 'name' | 'unit'>,
  vals: number[],
): ParameterSeries {
  return {
    ...identity,
    points: [
      { date: '2026-04-01', value: vals[0] },
      { date: '2026-05-01', value: vals[1] },
      { date: '2026-06-01', value: vals[2] },
    ],
    stats: {
      min: Math.min(...vals),
      avg: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10,
      max: Math.max(...vals),
      change_percent: Math.round(((vals[2] - vals[0]) / vals[0]) * 1000) / 10,
    },
  };
}

// Names/units for the mock custom slots — mirror the measurements custom-fields
// mock so the analytics form and chart line up in tests / mock mode.
const CUSTOM_FIELD_MOCKS: Record<number, { name: string; unit: string }> = {
  1: { name: 'Жир %', unit: '%' },
  2: { name: 'Пульс покоя', unit: 'уд/мин' },
  3: { name: 'Сон', unit: 'ч' },
};

function anthropometry(params: BodyParameter[], customSlots: number[]): AnthropometrySeriesOut {
  const palette: Record<string, number[]> = {
    weight: [82, 80, 78],
    waist: [88, 86, 84],
    chest: [100, 101, 102],
    hips: [95, 94, 93],
    biceps: [38, 39, 40],
    thigh: [58, 57, 56],
  };
  const customPalette: Record<number, number[]> = {
    1: [20, 18, 15],
    2: [62, 60, 58],
    3: [6.5, 7, 7.5],
  };
  return {
    parameters: [
      ...params.map((p) =>
        seriesFromValues(
          { parameter: p, custom_slot: null, name: null, unit: null },
          palette[p] ?? [10, 11, 12],
        ),
      ),
      ...customSlots.map((slot) => {
        const meta = CUSTOM_FIELD_MOCKS[slot] ?? { name: `Поле ${slot}`, unit: '' };
        return seriesFromValues(
          { parameter: null, custom_slot: slot, name: meta.name, unit: meta.unit },
          customPalette[slot] ?? [1, 2, 3],
        );
      }),
    ],
  };
}

const photoDates: PhotoDatesOut = { dates: ['2026-04-01', '2026-05-01', '2026-06-01'] };

const photoCompare: PhotoComparisonOut = {
  first: { date: '2026-04-01', url: '/api/v1/measurements/mock-before/photos/front/content' },
  second: { date: '2026-06-01', url: '/api/v1/measurements/mock-after/photos/front/content' },
};

export const analyticsHandlers = [
  http.get(`${base}/anthropometry/parameters`, () =>
    HttpResponse.json({
      parameters: [
        'height',
        'weight',
        'waist',
        'chest',
        'hips',
        'thigh',
        'shoulder',
        'ankle',
        'calf',
        'biceps',
        'forearm',
        'wrist',
        'neck',
      ],
      custom_slots: [1, 2, 3],
    }),
  ),
  http.get(`${base}/dashboard`, () => HttpResponse.json(dashboard)),
  http.get(`${base}/workouts/series-by-exercise`, ({ request }) => {
    // Фильтр по упражнению сужает ответ до одной карточки — так же, как на
    // сервере: иначе тест «по упражнению» проходил бы и на сломанном фильтре.
    const exerciseId = new URL(request.url).searchParams.get('exercise_id');
    const exercises = exerciseId
      ? workoutSeriesByExercise.exercises.filter((e) => e.exercise_id === exerciseId)
      : workoutSeriesByExercise.exercises;
    return HttpResponse.json({ exercises });
  }),
  http.get(`${base}/anthropometry/series`, ({ request }) => {
    const url = new URL(request.url);
    const params = url.searchParams.getAll('parameters') as BodyParameter[];
    const customSlots = url.searchParams.getAll('custom_slots').map(Number);
    // Default to weight only when nothing at all was requested.
    const effective =
      params.length || customSlots.length ? params : (['weight'] as BodyParameter[]);
    return HttpResponse.json(anthropometry(effective, customSlots));
  }),
  http.get(`${base}/photos/dates`, () => HttpResponse.json(photoDates)),
  http.get(`${base}/photos/compare`, () => HttpResponse.json(photoCompare)),
];
