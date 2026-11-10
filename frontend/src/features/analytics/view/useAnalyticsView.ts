import { PARAM_META } from '../config/meta';
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import { localDateKey } from '@/shared/lib/time/localDateKey';

import type { BodyParameter, WorkoutMetric } from '../config/types';

export type AnalyticsTab = 'workouts' | 'anthropometry';
export type WorkoutView = 'program' | 'exercise';

/**
 * Everything the analytics screen shows is derived from these fields, and they
 * live in the URL rather than in component state.
 *
 * The screen replaced a saved-config constructor, so the choices had to land
 * somewhere. The URL keeps the screen shareable and survives a reload, and —
 * unlike writing to `analytics_config` — costs no server round-trip per tap.
 * The `home_*` keys in that config are untouched: they belong to the home
 * screen, not to this one.
 */
export interface AnalyticsView {
  tab: AnalyticsTab;
  /**
   * Whose data is charted: `null` is the viewer's own.
   *
   * A trainer who has switched to "Клиенты" but whose client list has not
   * arrived yet is `'pending'` — the switch must latch on the tap rather than
   * silently doing nothing, and the id is filled in once the list resolves.
   */
  clientId: string | null | 'pending';
  workoutView: WorkoutView;
  programId: string;
  dayId: string;
  exerciseId: string;
  metric: WorkoutMetric;
  dateFrom: string;
  dateTo: string;
  parameters: BodyParameter[];
  customSlots: number[];
}

const TABS: AnalyticsTab[] = ['workouts', 'anthropometry'];
const WORKOUT_VIEWS: WorkoutView[] = ['program', 'exercise'];
const METRICS: WorkoutMetric[] = ['weight', 'reps', 'sets'];
const PARAMETERS: BodyParameter[] = PARAM_META.map((p) => p.id);

/** The default window: the last 90 days, in the user's LOCAL calendar dates. */
function defaultRange(): { dateFrom: string; dateTo: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - 90);
  return { dateFrom: localDateKey(from), dateTo: localDateKey(to) };
}

/** An ISO date, or '' — anything else in the URL is ignored rather than charted. */
function readDate(raw: string | null): string {
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
}

function readOneOf<T extends string>(raw: string | null, allowed: T[], fallback: T): T {
  return allowed.includes(raw as T) ? (raw as T) : fallback;
}

export function useAnalyticsView(): {
  view: AnalyticsView;
  patch: (next: Partial<AnalyticsView>) => void;
} {
  const [params, setParams] = useSearchParams();

  const view = useMemo<AnalyticsView>(() => {
    const fallback = defaultRange();
    const parameters = params
      .getAll('parameter')
      .filter((p): p is BodyParameter => PARAMETERS.includes(p as BodyParameter));
    return {
      tab: readOneOf(params.get('tab'), TABS, 'workouts'),
      clientId: params.get('client') || (params.get('target') === 'client' ? 'pending' : null),
      workoutView: readOneOf(params.get('view'), WORKOUT_VIEWS, 'program'),
      programId: params.get('program') ?? '',
      dayId: params.get('day') ?? '',
      exerciseId: params.get('exercise') ?? '',
      metric: readOneOf(params.get('metric'), METRICS, 'weight'),
      dateFrom: readDate(params.get('from')) || fallback.dateFrom,
      dateTo: readDate(params.get('to')) || fallback.dateTo,
      // Nothing selected means weight, so the chart is never blank on arrival.
      parameters: parameters.length ? parameters : ['weight'],
      customSlots: params
        .getAll('slot')
        .map(Number)
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= 3),
    };
  }, [params]);

  const patch = useCallback(
    (next: Partial<AnalyticsView>) => {
      const merged = { ...view, ...next };
      const search = new URLSearchParams();
      // Only non-default values are written, so the common case stays a clean
      // URL and a shared link carries exactly what the sender changed.
      if (merged.tab !== 'workouts') search.set('tab', merged.tab);
      // 'pending' пишется как режим без id: клиент ещё не выбран, но выбор
      // «смотрю клиента» уже сделан и должен пережить перерисовку.
      if (merged.clientId === 'pending') search.set('target', 'client');
      else if (merged.clientId) search.set('client', merged.clientId);
      if (merged.tab === 'workouts') {
        if (merged.workoutView !== 'program') search.set('view', merged.workoutView);
        if (merged.workoutView === 'program') {
          if (merged.programId) search.set('program', merged.programId);
          if (merged.dayId) search.set('day', merged.dayId);
        } else if (merged.exerciseId) search.set('exercise', merged.exerciseId);
        if (merged.metric !== 'weight') search.set('metric', merged.metric);
      } else {
        for (const p of merged.parameters) search.append('parameter', p);
        for (const s of merged.customSlots) search.append('slot', String(s));
      }
      const fallback = defaultRange();
      if (merged.dateFrom !== fallback.dateFrom) search.set('from', merged.dateFrom);
      if (merged.dateTo !== fallback.dateTo) search.set('to', merged.dateTo);
      // `replace`: switching a tab or a metric is not a place the back button
      // should have to walk through one tap at a time.
      setParams(search, { replace: true });
    },
    [view, setParams],
  );

  return { view, patch };
}
