import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api, toApiError } from '@/shared/api/client';
import { MARK_NOTIFICATIONS_READ_KEY } from '@/shared/lib/offline/mutationKeys';

import { notificationsQueryKey } from './use-notifications';

export interface MarkReadVars {
  // undefined / omitted => mark all as read
  notificationIds?: string[];
}

export async function markReadMutationFn({ notificationIds }: MarkReadVars) {
  if (notificationIds === undefined) {
    const { error } = await api.POST('/api/v1/notifications/read-all');
    if (error) throw toApiError(error);
    return;
  }
  const { error } = await api.POST('/api/v1/notifications/read', {
    body: { notification_ids: notificationIds },
  });
  if (error) throw toApiError(error);
}

export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: [...MARK_NOTIFICATIONS_READ_KEY],
    mutationFn: markReadMutationFn,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: notificationsQueryKey });
    },
  });
}
