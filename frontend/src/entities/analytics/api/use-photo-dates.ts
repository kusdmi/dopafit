import { useQuery } from '@tanstack/react-query';

import { api, toApiError } from '@/shared/api/client';
import type { components } from '@/shared/api/schema';

type PhotoKind = components['schemas']['PhotoKind'];

export function usePhotoDates(kind: PhotoKind, clientId?: string, enabled = true) {
  return useQuery({
    queryKey: ['analytics', 'photo-dates', kind, clientId ?? null],
    enabled,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/analytics/photos/dates', {
        params: { query: { kind, client_id: clientId } },
      });
      if (error) throw toApiError(error);
      return data;
    },
  });
}
