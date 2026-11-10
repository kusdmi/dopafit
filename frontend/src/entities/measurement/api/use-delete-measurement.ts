import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api, toApiError } from '@/shared/api/client';
import { dequeueAllForMeasurement } from '@/shared/lib/offline/photo-queue';

import { measurementsListKey } from './use-measurements';

export function useDeleteMeasurement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE('/api/v1/measurements/{measurement_id}', {
        params: { path: { measurement_id: id } },
      });
      if (error) throw toApiError(error);
      // Drop any photos still queued for this measurement so a deleted record
      // cannot leave orphaned uploads churning against a 404 forever.
      await dequeueAllForMeasurement(id);
    },
    onSuccess: async (_result, id) => {
      queryClient.removeQueries({ queryKey: ['measurements', id] });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: measurementsListKey }),
        queryClient.invalidateQueries({ queryKey: ['analytics'] }),
      ]);
    },
  });
}
