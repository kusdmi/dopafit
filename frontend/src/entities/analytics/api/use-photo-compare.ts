import { useQuery } from '@tanstack/react-query';

import { api, toApiError } from '@/shared/api/client';
import type { components } from '@/shared/api/schema';

type PhotoKind = components['schemas']['PhotoKind'];

export interface CompareParams {
  kind: PhotoKind;
  firstDate: string;
  secondDate: string;
  clientId?: string;
}

export function usePhotoCompare(params: CompareParams | null) {
  return useQuery({
    queryKey: ['analytics', 'photo-compare', params],
    enabled: params !== null,
    queryFn: async () => {
      const p = params as CompareParams;
      const { data, error } = await api.GET('/api/v1/analytics/photos/compare', {
        params: {
          query: {
            kind: p.kind,
            first_date: p.firstDate,
            second_date: p.secondDate,
            client_id: p.clientId,
          },
        },
      });
      if (error) throw toApiError(error);
      return data;
    },
  });
}
