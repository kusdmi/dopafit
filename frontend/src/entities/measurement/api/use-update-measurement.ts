import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api, toApiError } from '@/shared/api/client';
import type { components } from '@/shared/api/schema';
import { persistFailedMutation } from '@/shared/lib/offline/failed-mutations';
import { UPDATE_MEASUREMENT_KEY } from '@/shared/lib/offline/mutationKeys';

type MeasurementCreate = components['schemas']['MeasurementCreate'];
type MeasurementOut = components['schemas']['MeasurementOut'];

// Variables carry the target id so a replayed offline update (dehydrated with the
// mutationKey only) still targets the right record after an app restart.
export interface UpdateMeasurementVars {
  measurementId: string;
  body: MeasurementCreate;
}

export async function updateMeasurementMutationFn(
  vars: UpdateMeasurementVars,
): Promise<MeasurementOut> {
  const { data, error } = await api.PUT('/api/v1/measurements/{measurement_id}', {
    params: { path: { measurement_id: vars.measurementId } },
    body: vars.body,
  });
  if (error) throw toApiError(error);
  return data as MeasurementOut;
}

// Offline-first update: shares the offline mutationKey + registered defaults so a
// paused edit dehydrates and replays after a hard reload (mirrors useSaveMeasurement).
// Invalidations live in the mutation DEFAULTS (setupOffline) so they also fire on the
// replay path where the hook's onSettled is dropped on dehydrate.
export function useUpdateMeasurement() {
  const queryClient = useQueryClient();
  return useMutation<
    MeasurementOut,
    unknown,
    UpdateMeasurementVars,
    { ready: boolean; previous: unknown }
  >({
    mutationKey: [...UPDATE_MEASUREMENT_KEY],
    mutationFn: updateMeasurementMutationFn,
    onError: (error, variables, context) => {
      if (context?.previous) queryClient.setQueryData(['measurements', 'list'], context.previous);
      persistFailedMutation(UPDATE_MEASUREMENT_KEY, variables, 'Замер', error);
    },
    onMutate: async ({ measurementId, body }) => {
      const previous = queryClient.getQueryData(['measurements', 'list']);
      await queryClient.cancelQueries({ queryKey: ['measurements'] });
      queryClient.setQueryData<{ items: MeasurementOut[]; total: number }>(
        ['measurements', 'list'],
        (page) =>
          page
            ? {
                ...page,
                items: page.items.map((item) =>
                  item.id === measurementId
                    ? { ...item, ...body, id: measurementId, __pendingSync: true }
                    : item,
                ),
              }
            : page,
      );
      return { ready: true, previous };
    },
  });
}
