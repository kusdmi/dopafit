import { useMutation } from '@tanstack/react-query';

import { api, toApiError } from '@/shared/api/client';
import type { components } from '@/shared/api/schema';
import { SYNC_WORKOUT_KEY } from '@/shared/lib/offline/mutationKeys';

type SessionSyncRequest = components['schemas']['SessionSyncRequest'];
type SessionSummaryOut = components['schemas']['SessionSummaryOut'];

export async function syncSessionMutationFn(
  body: SessionSyncRequest,
): Promise<SessionSummaryOut> {
  const { data, error } = await api.POST('/api/v1/workouts/sessions/sync', { body });
  if (error) throw toApiError(error);
  return data as SessionSummaryOut;
}

export function useSyncSession() {
  return useMutation<SessionSummaryOut, unknown, SessionSyncRequest>({
    mutationKey: [...SYNC_WORKOUT_KEY],
    mutationFn: syncSessionMutationFn,
  });
}
