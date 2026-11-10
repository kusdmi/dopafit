import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api, toApiError } from '@/shared/api/client';
import type { components } from '@/shared/api/schema';
import { isRetriableFailure, persistFailedMutation } from '@/shared/lib/offline/failed-mutations';
import { SAVE_PROGRAM_KEY } from '@/shared/lib/offline/mutationKeys';
import { safeRandomUUID } from '@/shared/lib/uuid';

import { programKey } from './use-program';
import { programsListKey } from './use-programs';

type ProgramCreate = components['schemas']['ProgramCreate'];
type ProgramUpdate = components['schemas']['ProgramUpdate'];
type ProgramOut = components['schemas']['ProgramOut'];
type ProgramListItem = components['schemas']['ProgramListItem'];

interface SaveVars {
  body: ProgramCreate;
  programId?: string; // present => update (PUT), absent => create (POST)
  expectedUpdatedAt?: string;
}

export async function saveProgramMutationFn({
  body,
  programId,
  expectedUpdatedAt,
}: SaveVars): Promise<ProgramOut> {
  if (programId) {
    if (!expectedUpdatedAt) throw new Error('Program version is required for update');
    const { data, error } = await api.PUT('/api/v1/programs/{program_id}', {
      params: { path: { program_id: programId } },
      body: { ...body, expected_updated_at: expectedUpdatedAt } satisfies ProgramUpdate,
    });
    if (error) throw toApiError(error);
    return data as ProgramOut;
  }
  const { data, error } = await api.POST('/api/v1/programs', { body });
  if (error) throw toApiError(error);
  return data as ProgramOut;
}

function toOptimisticItem(body: ProgramCreate): ProgramListItem {
  const dayCount = body.days.length;
  const exerciseCount = body.days.reduce(
    (sum, d) => sum + d.slots.filter((s) => s.exercises.some((e) => e.variant_order === 0)).length,
    0,
  );
  return {
    id: body.id ?? safeRandomUUID(),
    name: body.name,
    kind: body.kind,
    is_standard: false,
    day_count: dayCount,
    exercise_count: exerciseCount,
    __pendingSync: true,
  } as unknown as ProgramListItem;
}

export function useSaveProgram() {
  const queryClient = useQueryClient();
  return useMutation<ProgramOut, unknown, SaveVars, { previous: unknown }>({
    mutationKey: [...SAVE_PROGRAM_KEY],
    mutationFn: saveProgramMutationFn,
    retry: (failureCount, error) => failureCount < 3 && isRetriableFailure(error),
    onMutate: async ({ body, programId }) => {
      await queryClient.cancelQueries({ queryKey: programsListKey });
      const previous = queryClient.getQueryData(programsListKey);
      const optimistic = toOptimisticItem(body);
      // Real API returns ProgramListItem[] array directly
      queryClient.setQueryData(programsListKey, (old: ProgramListItem[] | undefined) => {
        if (!old) return [optimistic];
        if (programId) {
          return old.map((it) => (it.id === programId ? optimistic : it));
        }
        return [optimistic, ...old];
      });
      return { previous };
    },
    onError: (error, variables, context) => {
      if (context?.previous) queryClient.setQueryData(programsListKey, context.previous);
      // Same shadowing as useSaveMeasurement (MAJOR-1): this hook's onError
      // overrides the SAVE_PROGRAM_KEY defaults' onError, so persist here for the
      // in-session failure. The cold-boot replay runs the defaults' onError, and
      // dedupe keeps a given failure from double-writing.
      persistFailedMutation(SAVE_PROGRAM_KEY, variables, 'Программа', error);
    },
    onSettled: (_data, _error, { programId }) => {
      void queryClient.invalidateQueries({ queryKey: programsListKey });
      // On update the detail query must be refreshed too, otherwise the
      // An already-mounted ProgramDetailPage / StartWorkoutPage keeps stale days/slots
      // (see use-add-exercise.ts). This covers the online path; the same
      // invalidation is registered in the SAVE_PROGRAM_KEY mutation defaults so
      // it also fires when a paused offline save is replayed after an app
      // restart (the hook onSettled is dropped on dehydrate).
      if (programId) {
        void queryClient.invalidateQueries({ queryKey: programKey(programId) });
      }
    },
  });
}
