import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api, toApiError } from '@/shared/api/client';
import type { components } from '@/shared/api/schema';

import { exerciseDetailKeyPrefix } from './use-exercise';
import { exercisesListKey } from './use-exercises';

type UpdateBody = components['schemas']['ExerciseUpdateRequest'];

export function useUpdateExercise() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: UpdateBody }) => {
      const { data, error } = await api.PATCH('/api/v1/exercises/{exercise_id}', {
        params: { path: { exercise_id: id } },
        body,
      });
      if (error) throw toApiError(error);
      return data;
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: exercisesListKey });
      void queryClient.invalidateQueries({ queryKey: exerciseDetailKeyPrefix });
    },
  });
}
