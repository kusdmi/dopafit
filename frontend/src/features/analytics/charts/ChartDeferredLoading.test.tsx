import { setMockSubscription } from '@/entities/subscription/api/mocks';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resetMeasurementStore } from '@/entities/measurement/api/mocks';
import { workoutSeriesByExerciseKey } from '@/entities/analytics/api/use-workout-series-by-exercise';
import { server } from '@/app/mocks/server';
import { env } from '@/shared/config/env';

import { AnthropometryChart } from './AnthropometryChart';
import { ExerciseCharts } from './ExerciseCharts';

function wrap(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

// Порог DeferredLoading (200мс) + минимум показа: скелетон появляется не мгновенно,
// поэтому проверяем главное — ДО резолва не рендерятся «—/0»-состояния, а после
// резолва приходят реальные значения.
describe('analytics charts defer their empty "0" states (M4 / UX-1)', () => {
  beforeEach(() => resetMeasurementStore());
  afterEach(() => resetMeasurementStore());

  it('ExerciseCharts does not flash "—"/"0" stat values before the series resolves', async () => {
    wrap(
      <ExerciseCharts
        view="exercise"
        programId=""
        dayId=""
        exerciseId=""
        dateFrom="2026-04-01"
        dateTo="2026-06-01"
        clientId={null}
      />,
    );

    // On first render, while loading, the "Общее кол-во" stat with a hard "0"
    // must NOT be present (it used to render 0 immediately).
    expect(screen.queryByText('Общее кол-во')).not.toBeInTheDocument();

    // Once the query resolves, the real stat cards render — one set per
    // exercise, so assert on presence rather than a single match.
    await waitFor(() => expect(screen.getAllByText('Общее кол-во').length).toBeGreaterThan(0));
  });

  it('AnthropometryChart does not flash empty "%"-cards before the series resolves', async () => {
    wrap(
      <AnthropometryChart
        params={{ parameters: ['weight'], customSlots: [] }}
        dateFrom="2026-04-01"
        dateTo="2026-06-01"
        clientId={null}
      />,
    );

    // No stat card with a change-percent value before data arrives.
    expect(screen.queryByText('Вес')).not.toBeInTheDocument();

    await waitFor(() => expect(screen.getByText('Вес')).toBeInTheDocument());
  });

  it('hides cached client workout analytics after access is revoked', async () => {
    const dateFrom = '2026-04-01';
    const dateTo = '2026-06-01';
    const clientId = 'client-linked-1';
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(workoutSeriesByExerciseKey({ dateFrom, dateTo, clientId, exerciseId: 'ex1' }), {
      exercises: [
        {
          exercise_id: 'ex1',
          name: 'Секретная тренировка',
          points: [],
          stats: { avg_weight: 80, avg_reps: 10, total_workouts: 1 },
        },
      ],
    });
    server.use(
      http.get(`${env.apiUrl}/api/v1/analytics/workouts/series-by-exercise`, () =>
        HttpResponse.json({ code: 'not_found', message: 'Client not found' }, { status: 404 }),
      ),
    );

    render(
      <QueryClientProvider client={qc}>
        <ExerciseCharts
          view="exercise"
          programId=""
          dayId=""
          exerciseId="ex1"
          dateFrom={dateFrom}
          dateTo={dateTo}
          clientId={clientId}
        />
      </QueryClientProvider>,
    );
    expect(screen.queryByText('Секретная тренировка')).not.toBeInTheDocument();
    expect(await screen.findByText('Не удалось загрузить данные клиента')).toBeInTheDocument();
    expect(screen.queryByText('Секретная тренировка')).not.toBeInTheDocument();
  });
});

beforeEach(() =>
  setMockSubscription({
    is_active: true,
    ends_at: '2099-01-01T00:00:00Z',
    entitlements: undefined,
  }),
);

it.each(['anthropometry', 'workouts'] as const)(
  'explains the free analytics period in %s',
  async (kind) => {
    server.use(
      http.get(
        `**/api/v1/analytics/${kind === 'anthropometry' ? 'anthropometry/series' : 'workouts/series-by-exercise'}`,
        () =>
          HttpResponse.json({
            parameters: [],
            exercises: [],
            range: { limited: true, date_from: '2026-05-02', date_to: '2026-06-01' },
          }),
      ),
    );
    wrap(
      kind === 'anthropometry' ? (
        <AnthropometryChart
          params={{ parameters: ['weight'] }}
          dateFrom="2026-01-01"
          dateTo="2026-06-01"
          clientId={null}
        />
      ) : (
        <ExerciseCharts
          view="exercise"
          programId=""
          dayId=""
          exerciseId=""
          dateFrom="2026-01-01"
          dateTo="2026-06-01"
          clientId={null}
        />
      ),
    );
    const notice = await screen.findByRole('note', { name: 'Бесплатная аналитика' });
    expect(notice).toHaveTextContent('Бесплатная аналитика за последние 30 дней');
    expect(notice).toHaveTextContent('Показаны данные с 2 мая 2026 по 1 июня 2026.');
  },
);
