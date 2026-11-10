import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api, toApiError } from '@/shared/api/client';
import type { components } from '@/shared/api/schema';
import { ADD_EXERCISE_TO_PROGRAM_KEY } from '@/shared/lib/offline/mutationKeys';

import { programKey } from './use-program';
import { programsListKey } from './use-programs';

type AddExerciseToProgramRequest = components['schemas']['AddExerciseToProgramRequest'];

interface AddExerciseVars {
  programId: string;
  body: AddExerciseToProgramRequest;
}

export async function addExerciseToProgramMutationFn({ programId, body }: AddExerciseVars) {
  const { data, error } = await api.POST('/api/v1/programs/{program_id}/exercises', {
    params: { path: { program_id: programId } },
    body,
  });
  if (error) throw toApiError(error);
  return data;
}

export function useAddExerciseToProgram() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: [...ADD_EXERCISE_TO_PROGRAM_KEY],
    mutationFn: addExerciseToProgramMutationFn,
    onSettled: (_d, _e, vars) => {
      void queryClient.invalidateQueries({ queryKey: programsListKey });
      void queryClient.invalidateQueries({ queryKey: programKey(vars.programId) });
    },
  });
}
