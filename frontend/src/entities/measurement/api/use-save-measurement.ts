import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api, toApiError } from '@/shared/api/client';
import type { components } from '@/shared/api/schema';
import { persistFailedMutation } from '@/shared/lib/offline/failed-mutations';
import { SAVE_MEASUREMENT_KEY } from '@/shared/lib/offline/mutationKeys';

import { measurementsListKey } from './use-measurements';

type MeasurementCreate = components['schemas']['MeasurementCreate'];
type MeasurementOut = components['schemas']['MeasurementOut'];

interface MeasurementsPage {
  items: MeasurementOut[];
  total: number;
}

export async function saveMeasurementMutationFn(body: MeasurementCreate): Promise<MeasurementOut> {
  const { data, error } = await api.POST('/api/v1/measurements', { body });
  if (error) throw toApiError(error);
  return data as MeasurementOut;
}

export function useSaveMeasurement() {
  const queryClient = useQueryClient();
  return useMutation<MeasurementOut, unknown, MeasurementCreate, { previous: unknown }>({
    mutationKey: [...SAVE_MEASUREMENT_KEY],
    mutationFn: saveMeasurementMutationFn,
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: measurementsListKey });
      const previous = queryClient.getQueryData(measurementsListKey);
      queryClient.setQueryData(measurementsListKey, (old: MeasurementsPage | undefined) => {
        const optimistic = {
          ...body,
          updated_at: new Date().toISOString(),
          photos: [],
          __pendingSync: true,
        } as unknown as MeasurementOut;
        const items = old ? [optimistic, ...old.items] : [optimistic];
        // total === items.length holds while the API returns all rows; revisit if pagination is added.
        return { items, total: items.length };
      });
      return { previous };
    },
    onError: (error, variables, context) => {
      if (context?.previous) queryClient.setQueryData(measurementsListKey, context.previous);
      // The hook's onError shadows the SAVE_MEASUREMENT_KEY defaults' onError
      // (TanStack v5 shallow-merges same-key options), so the defaults' persist
      // never runs on the in-session path — persist here too, or a save that
      // exhausts its retries in-session would be dropped silently (MAJOR-1). The
      // cold-boot replay path runs the defaults' onError instead (the hook's is
      // gone on dehydrate), so the two paths persist a given failure exactly once.
      persistFailedMutation(SAVE_MEASUREMENT_KEY, variables, 'Замер', error);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: measurementsListKey });
      // Analytics charts read a separate query key (['analytics', 'anthropometry-series', ...]).
      // Invalidate the whole 'analytics' prefix so a freshly saved measurement shows up on the
      // chart immediately, without needing a manual refetch (e.g. toggling the analytics tab).
      void queryClient.invalidateQueries({ queryKey: ['analytics'] });
    },
  });
}
