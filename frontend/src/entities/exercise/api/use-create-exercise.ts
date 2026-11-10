import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api, toApiError } from '@/shared/api/client';
import type { components } from '@/shared/api/schema';

import { exercisesListKey } from './use-exercises';

type CreateBody = components['schemas']['ExerciseCreateRequest'];

export function useCreateExercise() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateBody) => {
      const { data, error } = await api.POST('/api/v1/exercises', { body });
      if (error) throw toApiError(error);
      return data;
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: exercisesListKey });
    },
  });
}
