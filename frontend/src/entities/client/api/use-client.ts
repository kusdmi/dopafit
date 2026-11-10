import { useQuery } from '@tanstack/react-query';

import { api, toApiError } from '@/shared/api/client';

export const clientKey = (id: string) => ['clients', id] as const;

export function useClient(id: string) {
  return useQuery({
    queryKey: clientKey(id),
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/clients/{client_id}', {
        params: { path: { client_id: id } },
      });
      if (error) throw toApiError(error);
      return data;
    },
    enabled: id !== '',
  });
}
