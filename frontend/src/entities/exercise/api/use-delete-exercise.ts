import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api, toApiError } from '@/shared/api/client';

import { exercisesListKey } from './use-exercises';

export function useDeleteExercise() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE('/api/v1/exercises/{exercise_id}', {
        params: { path: { exercise_id: id } },
      });
      if (error) throw toApiError(error);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: exercisesListKey });
    },
  });
}
