import { bindQueryCache } from '@/shared/lib/query/cache-policy';
import { useEffect } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import type { components } from '@/shared/api/schema';
import { api, toApiError } from '@/shared/api/client';
import { STALE_REFERENCE_DATA } from '@/shared/lib/query/stale-times';
import { EXERCISE_GC_TIME, EXERCISE_PAGE_SIZE } from '@/shared/lib/query/exercise-cache';

export interface ExercisesFilter {
  search?: string;
  categoryId?: string;
  favoritesOnly?: boolean;
}
export const exercisesListKey = ['exercises', 'list'] as const;
type Item = components['schemas']['ExerciseListItem'];

/** Fetch only the pages intersecting the virtual viewport, with cancellation. */
export function useExercises(filter: ExercisesFilter, { start = 0, end = 1, enabled = true } = {}) {
  const client = useQueryClient();
  useEffect(() => bindQueryCache(client), [client]);
  const normalized = {
    search: filter.search?.trim() || undefined,
    categoryId: filter.categoryId || undefined,
    favoritesOnly: filter.favoritesOnly || undefined,
  };
  const first = Math.floor(start / EXERCISE_PAGE_SIZE);
  // A corrupt saved position must never start an unbounded number of requests.
  const last = Math.min(first + 2, Math.floor(Math.max(start, end - 1) / EXERCISE_PAGE_SIZE));
  const offsets = Array.from(
    { length: last - first + 1 },
    (_, i) => (first + i) * EXERCISE_PAGE_SIZE,
  );
  const pages = useQueries({
    queries: offsets.map((offset) => ({
      queryKey: [...exercisesListKey, normalized, offset],
      enabled,
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        const { data, error } = await api.GET('/api/v1/exercises', {
          signal,
          params: {
            query: {
              search: normalized.search,
              category_id: normalized.categoryId,
              favorites_only: normalized.favoritesOnly,
              limit: EXERCISE_PAGE_SIZE,
              offset,
            },
          },
        });
        if (error) throw toApiError(error);
        if (!data) throw toApiError(null);
        return data;
      },
      staleTime: STALE_REFERENCE_DATA,
      gcTime: EXERCISE_GC_TIME,
    })),
  });
  const items = pages.flatMap((page) => page.data?.items ?? []);
  const cachedTotal = client
    .getQueriesData<components['schemas']['ExerciseListPage']>({
      queryKey: [...exercisesListKey, normalized],
    })
    .find(([, page]) => page)?.[1]?.total;
  return {
    data:
      cachedTotal !== undefined
        ? { items, total: pages.find((page) => page.data)?.data?.total ?? cachedTotal }
        : undefined,
    itemAt: (index: number): Item | undefined => {
      const pageIndex = Math.floor(index / EXERCISE_PAGE_SIZE) - first;
      return pages[pageIndex]?.data?.items[index % EXERCISE_PAGE_SIZE];
    },
    isLoading: pages.some((page) => page.isPending && !page.data),
    isError: pages.some((page) => page.isError),
    isPaused: pages.some((page) => page.fetchStatus === 'paused' && !page.data),
    refetch: () => Promise.all(pages.map((page) => page.refetch())),
  };
}
