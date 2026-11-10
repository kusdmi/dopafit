import { useQuery } from '@tanstack/react-query';
import { api, toApiError } from '@/shared/api/client';
export function useAvailableParameters(clientId: string | null) {
  return useQuery({
    queryKey: ['analytics', 'parameters', clientId],
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/analytics/anthropometry/parameters', {
        params: { query: { client_id: clientId ?? undefined } },
      });
      if (error) throw toApiError(error);
      return data;
    },
  });
}
