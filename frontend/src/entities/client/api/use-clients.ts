import { useQuery } from '@tanstack/react-query';

import { api, toApiError } from '@/shared/api/client';

/**
 * Корень всех запросов об отношении тренер—клиент: список карточек тренера
 * (`clientsListKey`), одна карточка (`clientKey`) и тренер клиента
 * (`myTrainerKey`). Инвалидация по нему обновляет обе стороны отношения разом —
 * это нужно там, где меняется сама связь, а не отдельная карточка.
 */
export const clientsKeyRoot = ['clients'] as const;
export const clientsListKey = ['clients', 'list'] as const;

export function useClients(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: clientsListKey,
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/clients');
      if (error) throw toApiError(error);
      return data;
    },
  });
}
