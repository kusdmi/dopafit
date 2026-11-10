import { bindQueryCache } from '@/shared/lib/query/cache-policy';
import { useEffect } from 'react';
import { EXERCISE_GC_TIME } from '@/shared/lib/query/exercise-cache';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { api, toApiError } from '@/shared/api/client';

export const exerciseDetailKeyPrefix = ['exercises', 'detail'] as const;
export const exerciseKey = (id: string) => ['exercises', 'detail', id] as const;

export function useExercise(id: string | null) {
  const client = useQueryClient();
  useEffect(() => bindQueryCache(client), [client]);
  return useQuery({
    gcTime: EXERCISE_GC_TIME,
    queryKey: exerciseKey(id ?? ''),
    enabled: id !== null && id !== '',
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/api/v1/exercises/{exercise_id}', {
        signal,
        params: { path: { exercise_id: id! } },
      });
      if (error) throw toApiError(error);
      return data;
    },
  });
}
