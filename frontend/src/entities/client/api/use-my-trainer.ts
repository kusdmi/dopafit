import { useQuery } from '@tanstack/react-query';

import { api, toApiError } from '@/shared/api/client';

export const myTrainerKey = ['clients', 'my-trainer'] as const;

/**
 * Тренер, с которым связан текущий пользователь, — или `null`, если связи нет.
 *
 * Зеркало `useClients`: тот список принадлежит тренеру, а этот запрос отвечает
 * клиенту. Ключ намеренно начинается с `'clients'`, поэтому инвалидация
 * `clientsListKey`-соседей по префиксу `['clients']` задевает и его: принятие
 * запроса на связь и отвязка меняют ровно одно и то же отношение.
 */
export function useMyTrainer(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: myTrainerKey,
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/clients/my-trainer');
      if (error) throw toApiError(error);
      return data.trainer;
    },
  });
}
