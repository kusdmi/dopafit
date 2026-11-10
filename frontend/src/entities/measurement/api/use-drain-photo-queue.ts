import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import type { components } from '@/shared/api/schema';

import { measurementsListKey } from './use-measurements';
import { processPhotoQueue } from './use-photo-upload';

type MeasurementOut = components['schemas']['MeasurementOut'];

interface MeasurementsPage {
  items: MeasurementOut[];
  total: number;
}

/**
 * Drains the queued measurement photos whenever the network comes back.
 *
 * The optimistic cache writes each measurement under its client id and flags it
 * `__pendingSync` until the server confirms. A queued photo's `measurementClientId`
 * therefore equals the synced record's `id` in the cache, so the resolver maps a
 * client id to itself once the matching record exists without `__pendingSync`; any
 * still-pending (or absent) measurement returns undefined and stays queued.
 */
export function useDrainPhotoQueueOnline(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const drain = () => {
      const page = queryClient.getQueryData<MeasurementsPage>(measurementsListKey);
      const syncedIds = new Set(
        (page?.items ?? [])
          .filter((item) => !(item as { __pendingSync?: boolean }).__pendingSync)
          .map((item) => item.id),
      );
      void processPhotoQueue((clientId) =>
        syncedIds.has(clientId) ? clientId : undefined,
      ).then((uploaded) => {
        // Photos drain via a direct fetch outside react-query, so the list cache
        // doesn't know its serverPhotos changed; refetch when something landed.
        if (uploaded > 0) {
          void queryClient.invalidateQueries({ queryKey: measurementsListKey });
        }
      });
    };

    // Drain on mount too, not only on the 'online' event: "shot a photo offline →
    // relaunched online" never re-fires 'online', so without this the queue would
    // sit forever. processPhotoQueue coalesces concurrent runs, so an immediate
    // 'online' event right after mount can't double-upload.
    if (typeof navigator === 'undefined' || navigator.onLine) {
      drain();
    }

    window.addEventListener('online', drain);
    return () => window.removeEventListener('online', drain);
  }, [queryClient]);
}
