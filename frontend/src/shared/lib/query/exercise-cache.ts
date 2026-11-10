import type { DehydratedState } from '@tanstack/react-query';

export const EXERCISE_PAGE_SIZE = 40;
export const EXERCISE_PAGE_CACHE_LIMIT = 12;
const DETAIL_LIMIT = 10;
export const EXERCISE_GC_TIME = 5 * 60_000;

function kind(key: readonly unknown[]) {
  if (key[0] !== 'exercises') return null;
  if (key[1] === 'list') return 'list';
  if (key[1] === 'detail') return 'detail';
  return null;
}

// Drop the previous unbounded catalogue format on upgrade. Never touch mutations.
export function boundExerciseSnapshot(queries: DehydratedState['queries']) {
  const retained = new Set(
    (['list', 'detail'] as const).flatMap((type) =>
      queries
        .filter((query) => kind(query.queryKey) === type)
        .filter((query) => type !== 'list' || typeof query.queryKey[3] === 'number')
        .sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt)
        .slice(0, type === 'list' ? EXERCISE_PAGE_CACHE_LIMIT : DETAIL_LIMIT),
    ),
  );
  return queries.filter((query) => !kind(query.queryKey) || retained.has(query));
}
