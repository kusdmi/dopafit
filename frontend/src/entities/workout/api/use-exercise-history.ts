import { useQuery } from '@tanstack/react-query';

import { api, toApiError } from '@/shared/api/client';
import type { components } from '@/shared/api/schema';

type ExerciseHistoryOut = components['schemas']['ExerciseHistoryOut'];

export const exerciseHistoryKey = (variantId: string) => ['workouts', 'history', variantId] as const;

export function useExerciseHistory(variantId: string | null) {
  return useQuery({
    queryKey: exerciseHistoryKey(variantId ?? ''),
    enabled: variantId != null,
    queryFn: async (): Promise<ExerciseHistoryOut> => {
      const { data, error } = await api.GET('/api/v1/workouts/history/by-variant/{variant_id}', {
        params: { path: { variant_id: variantId as string } },
      });
      if (error) throw toApiError(error);
      return data as ExerciseHistoryOut;
    },
  });
}
