import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { PhotoKind } from '@/entities/measurement/model/fields';
import type { components } from '@/shared/api/schema';
import { api } from '@/shared/api/client';

import { measurementsListKey } from './use-measurements';

interface DeletePhotoArgs {
  measurementId: string;
  kind: PhotoKind;
}

type MeasurementOut = components['schemas']['MeasurementOut'];
type MeasurementPage = components['schemas']['MeasurementPage'];

export function useDeleteMeasurementPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ measurementId, kind }: DeletePhotoArgs) => {
      // The measurement id is a client id; if it hasn't synced yet the server has
      // no such record and returns 404. That's expected for offline-only photos —
      // swallow it so the caller can still clear the local preview and queue.
      const { error, response } = await api.DELETE(
        '/api/v1/measurements/{measurement_id}/photos/{kind}',
        { params: { path: { measurement_id: measurementId, kind } } },
      );
      if (error && response.status !== 404) throw error;
    },
    onSuccess: async (_, { measurementId, kind }) => {
      // Detail and list are cached separately. Remove the deleted photo from both
      // before a reload can restore the old detail from the persisted query cache.
      queryClient.setQueryData<MeasurementOut>(['measurements', measurementId], (record) =>
        record
          ? { ...record, photos: record.photos.filter((photo) => photo.kind !== kind) }
          : record,
      );
      queryClient.setQueryData<MeasurementPage>(measurementsListKey, (page) =>
        page
          ? {
              ...page,
              items: page.items.map((record) =>
                record.id === measurementId
                  ? { ...record, photos: record.photos.filter((photo) => photo.kind !== kind) }
                  : record,
              ),
            }
          : page,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['measurements', measurementId] }),
        queryClient.invalidateQueries({ queryKey: measurementsListKey }),
        queryClient.invalidateQueries({ queryKey: ['analytics'] }),
      ]);
    },
  });
}
