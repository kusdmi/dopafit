import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useSessionStore } from '@/entities/session/@x/user';
import { api, toApiError } from '@/shared/api/client';
import type { components } from '@/shared/api/schema';

type UpdateSettingsRequest = components['schemas']['UpdateSettingsRequest'];
type SettingsOut = components['schemas']['SettingsOut'];

export const settingsQueryKey = (userId: string) => ['users', userId, 'settings'] as const;

export function useSettings() {
  const userId = useSessionStore((state) => state.user?.id ?? 'anonymous');

  return useQuery({
    queryKey: settingsQueryKey(userId),
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/users/me/settings');
      if (error) {
        throw toApiError(error);
      }
      return data;
    },
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  const userId = useSessionStore((state) => state.user?.id ?? 'anonymous');

  return useMutation({
    mutationFn: async (body: UpdateSettingsRequest) => {
      const { data, error } = await api.PUT('/api/v1/users/me/settings', { body });
      if (error) {
        throw toApiError(error);
      }
      return data;
    },
    // Настройки применяются СРАЗУ, не дожидаясь ответа сервера. Без этого выбор
    // в пикере (замер, упражнение) повисал до конца круга: экран ещё показывал
    // старое значение, потом ответ приходил и всё разом перерисовывалось —
    // заметный рывок на каждом выборе.
    //
    // Откат по onError обязателен: иначе неудавшееся сохранение оставило бы на
    // экране значение, которого нет на сервере.
    onMutate: async (body) => {
      const key = settingsQueryKey(userId);
      // Иначе уже летящий refetch мог бы приземлиться ПОСЛЕ нашей записи и
      // вернуть старое значение.
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<SettingsOut>(key);
      queryClient.setQueryData<SettingsOut>(key, (old) => {
        if (!old) return old;
        // Поля запроса допускают null там, где ответ его не допускает
        // (notifications_enabled / theme), поэтому в слепок кладутся только
        // те ключи, которые реально пришли не-null. На практике Главная шлёт
        // один analytics_config, но подмешивать null в тип ответа нельзя.
        return {
          ...old,
          ...(body.analytics_config !== undefined
            ? { analytics_config: body.analytics_config }
            : {}),
          ...(body.notifications_enabled != null
            ? { notifications_enabled: body.notifications_enabled }
            : {}),
          ...(body.theme != null ? { theme: body.theme } : {}),
        };
      });
      return { previous };
    },
    onError: (_err, _body, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(settingsQueryKey(userId), context.previous);
      }
    },
    onSuccess: (settings) => {
      queryClient.setQueryData(settingsQueryKey(userId), settings);
    },
  });
}
