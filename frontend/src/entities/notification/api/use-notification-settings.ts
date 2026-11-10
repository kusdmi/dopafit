import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, toApiError } from '@/shared/api/client';
import type { components } from '@/shared/api/schema';
import { SAVE_NOTIFICATION_SETTINGS_KEY } from '@/shared/lib/offline/mutationKeys';

export type NotificationSettings = components['schemas']['NotificationSettingsOut'];
export type NotificationSettingsUpdate = components['schemas']['NotificationSettingsUpdate'];

export const notificationSettingsQueryKey = ['notifications', 'settings'] as const;

// Standalone mutationFn shared by the hook and the offline mutation defaults
// (registered in App.tsx). Keeping the business logic here (entities layer) lets
// the shared setupOffline helper receive it by injection without an FSD-breaking
// `shared` -> `entities` import.
export async function saveNotificationSettingsMutationFn(patch: NotificationSettingsUpdate) {
  const { data, error } = await api.PATCH('/api/v1/notifications/settings', { body: patch });
  if (error) throw toApiError(error);
  return data;
}

export function useNotificationSettings() {
  return useQuery({
    queryKey: notificationSettingsQueryKey,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/notifications/settings');
      if (error) throw toApiError(error);
      return data;
    },
  });
}

export function useUpdateNotificationSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: [...SAVE_NOTIFICATION_SETTINGS_KEY],
    mutationFn: saveNotificationSettingsMutationFn,
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: notificationSettingsQueryKey });
      const prev = queryClient.getQueryData<NotificationSettings>(notificationSettingsQueryKey);
      if (prev) {
        // NotificationSettingsUpdate fields are nullable; drop null/undefined so we
        // never overwrite the strictly-boolean NotificationSettingsOut with null.
        const next: NotificationSettings = { ...prev };
        for (const [key, value] of Object.entries(patch)) {
          if (typeof value === 'boolean') {
            next[key as keyof NotificationSettings] = value;
          }
        }
        queryClient.setQueryData<NotificationSettings>(notificationSettingsQueryKey, next);
      }
      return { prev };
    },
    onError: (_e, _patch, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(notificationSettingsQueryKey, ctx.prev);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: notificationSettingsQueryKey });
    },
  });
}
