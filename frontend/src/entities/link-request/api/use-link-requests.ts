import { useQuery } from '@tanstack/react-query';

import { api, toApiError } from '@/shared/api/client';
import type { components } from '@/shared/api/schema';

type Direction = components['schemas']['LinkRequestDirection'];

export const linkRequestsKey = (direction?: Direction) =>
  ['link-requests', direction ?? 'all'] as const;

export function useLinkRequests(direction?: Direction, enabled = true) {
  return useQuery({
    queryKey: linkRequestsKey(direction),
    enabled,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/link-requests', {
        params: { query: direction ? { direction } : {} },
      });
      if (error) throw toApiError(error);
      return data;
    },
  });
}
