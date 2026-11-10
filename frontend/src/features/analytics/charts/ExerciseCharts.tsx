import { useSubscriptionStatus } from '@/entities/subscription/api/use-subscription-status';
import { limitExercise } from './limit-series';
import { useMemo } from 'react';

import { useWorkoutSeriesByExercise } from '@/entities/analytics/api/use-workout-series-by-exercise';
import type { components } from '@/shared/api/schema';
import { DeferredLoading } from '@/shared/ui/DeferredLoading';
import { LineChart } from '@/shared/ui/LineChart';

import { ChartCard } from '../ChartCard';
import { FreeAnalyticsNotice } from './FreeAnalyticsNotice';
import { ChartSkeleton } from './ChartSkeleton';
import { StatTile } from './StatTile';

type ExerciseSeries = components['schemas']['ExerciseSeries'];

interface Props {
  dateFrom: string;
  dateTo: string;
  clientId: string | null;
  programId: string;
  dayId: string;
  exerciseId: string;
  /** 'program' charts every exercise of the day; 'exercise' charts just one. */
  view: 'program' | 'exercise';
}

/** Stable empty result: a literal would be a new reference on every render. */
const EMPTY: ExerciseSeries[] = [];

/**
 * One chart card per exercise (Figma 768:1058 / 786:2076 / 790:2522).
 *
 * Both plotted lines come from the SAME response: the mock's legend is
 * "Вес (общий)" and "Повторения" on one pair of axes, so the metric switch
 * above chooses what the reader compares, not what is fetched.
 */
function ExerciseChart({ series }: { series: ExerciseSeries }) {
  const points = series.points;
  // Memoised because LineChart keys its geometry off the `series` REFERENCE and
  // a finger scrub re-renders at 60–120Hz; an inline literal would recompute
  // scales, ticks and label selection every frame of the gesture.
  const lineSeries = useMemo(
    () => [
      {
        id: 'weight',
        label: 'Вес (общий)',
        color: 'var(--color-chart-1)',
        points: points.map((p) => ({ date: p.date, value: p.weight ?? 0 })),
      },
      {
        id: 'reps',
        label: 'Повторения',
        color: 'var(--color-chart-2)',
        points: points.map((p) => ({ date: p.date, value: p.reps ?? 0 })),
      },
    ],
    [points],
  );

  return (
    // Заголовок в две строки, как в макете: «Упражнение:» подписью и название
    // отдельной строкой — длинные названия («Разгибание ног сидя в тренажёре»)
    // иначе выталкивали бы карточку по ширине.
    <ChartCard
      title={
        <span className="flex flex-col">
          <span className="text-body-s text-muted">Упражнение:</span>
          <span className="text-h3 text-content">{series.name}</span>
        </span>
      }
    >
      <div className="flex flex-col gap-4">
        <LineChart series={lineSeries} />
        <div className="grid grid-cols-3 gap-3">
          <StatTile
            caption="Средний вес"
            value={series.stats.avg_weight ?? '—'}
            color="var(--color-chart-1)"
          />
          <StatTile
            caption="Средний повт."
            value={series.stats.avg_reps ?? '—'}
            color="var(--color-chart-2)"
          />
          <StatTile
            caption="Общее кол-во"
            value={series.stats.total_workouts}
            color="var(--color-chart-3)"
          />
        </div>
      </div>
    </ChartCard>
  );
}

export function ExerciseCharts({
  dateFrom,
  dateTo,
  clientId,
  programId,
  dayId,
  exerciseId,
  view,
}: Props) {
  const subscription = useSubscriptionStatus();
  const cutoff =
    subscription.data && !subscription.data.is_active
      ? new Date(subscription.serverNow - 30 * 86400000).toISOString().slice(0, 10)
      : '0001-01-01';
  const query = useWorkoutSeriesByExercise({
    dateFrom,
    dateTo,
    clientId: clientId ?? undefined,
    programId: view === 'program' ? programId || undefined : undefined,
    dayId: view === 'program' ? dayId || undefined : undefined,
    exerciseId: view === 'exercise' ? exerciseId || undefined : undefined,
  });

  const verified = !clientId || (query.isFetchedAfterMount && !query.isFetching && !query.isError);
  const exercises = verified ? (query.data?.exercises ?? EMPTY) : EMPTY;
  const visibleExercises = useMemo(
    () => exercises.map((series) => limitExercise(series, cutoff)),
    [exercises, cutoff],
  );
  const firstLoad = !query.isError && (clientId ? !verified : query.isLoading && !query.data);

  return clientId && query.isError ? (
    <p className="text-body-m text-center text-danger">Не удалось загрузить данные клиента</p>
  ) : (
    <DeferredLoading loading={firstLoad} fallback={<ChartSkeleton statCount={3} />}>
      <div className="flex flex-col gap-4">
        <FreeAnalyticsNotice range={query.data?.range} />
        {exercises.length === 0 ? (
          // 852:1520 — пустое состояние экрана рисуется одной обведённой плашкой,
          // а не пустым графиком с осями без точек.
          <div className="flex min-h-[240px] items-center justify-center rounded-[16px] border border-line p-4 text-body-m text-muted">
            Данные отсутствуют
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {visibleExercises.map((series) => (
              <ExerciseChart key={series.exercise_id} series={series} />
            ))}
          </div>
        )}
      </div>
    </DeferredLoading>
  );
}
