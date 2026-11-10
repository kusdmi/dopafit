import { useQuery } from '@tanstack/react-query';

import { api, toApiError } from '@/shared/api/client';
import type { components } from '@/shared/api/schema';

export type NotificationItem = components['schemas']['NotificationOut'];
export type NotificationPage = components['schemas']['NotificationPage'];

// Namespaced 'feed' so it doesn't prefix-collide with ['notifications', 'settings'];
// otherwise invalidating the feed would also refetch settings (prefix-based invalidation).
export const notificationsQueryKey = ['notifications', 'feed'] as const;

export function useNotifications() {
  return useQuery({
    queryKey: notificationsQueryKey,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/notifications');
      if (error) throw toApiError(error);
      return data;
    },
  });
}

export function useUnreadCount(): number {
  const { data } = useNotifications();
  return data?.unread ?? 0;
}
