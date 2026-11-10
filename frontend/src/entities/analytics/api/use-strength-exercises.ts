import { useQuery } from '@tanstack/react-query';

import { api, toApiError } from '@/shared/api/client';
import { STALE_REFERENCE_DATA } from '@/shared/lib/query/stale-times';

export const strengthExercisesKey = ['analytics', 'strength-exercises'] as const;

/**
 * Exercises the user has actually lifted — the options the Home strength picker
 * may offer. Deliberately NOT the whole `/exercises` catalogue: an exercise with
 * no recorded sets would chart an empty series.
 */
export function useStrengthExercises() {
  return useQuery({
    queryKey: strengthExercisesKey,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/analytics/strength-exercises');
      if (error) throw toApiError(error);
      return data;
    },
    // Список меняется только когда пользователь завершает тренировку с новым
    // упражнением — это редкое событие, а не поток данных.
    staleTime: STALE_REFERENCE_DATA,
  });
}
