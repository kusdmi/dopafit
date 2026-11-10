import { useQueries } from '@tanstack/react-query';
import { api, toApiError } from '@/shared/api/client';
import { recentExercises } from '@/shared/lib/recent/recent-exercises';
import { EXERCISE_GC_TIME } from '@/shared/lib/query/exercise-cache';
import { exerciseKey } from './use-exercise';

export function useRecentExercises(enabled: boolean) {
  const ids = recentExercises.get().slice(0, 10);
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: exerciseKey(id),
      enabled,
      gcTime: EXERCISE_GC_TIME,
      staleTime: 60_000,
      retry: false,
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        const { data, error } = await api.GET('/api/v1/exercises/{exercise_id}', {
          signal,
          params: { path: { exercise_id: id } },
        });
        if (error) throw toApiError(error);
        return data;
      },
    })),
  }).flatMap((query) => (query.data ? [query.data] : []));
}
