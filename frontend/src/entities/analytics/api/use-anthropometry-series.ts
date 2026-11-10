import { useQuery } from '@tanstack/react-query';

import { api, toApiError } from '@/shared/api/client';
import type { components } from '@/shared/api/schema';

type BodyParameter = components['schemas']['BodyParameter'];

export interface AnthropometryParams {
  dateFrom: string;
  dateTo: string;
  parameters: BodyParameter[];
  customSlots?: number[];
  clientId?: string;
}

export const anthropometryKey = (p: AnthropometryParams) =>
  ['analytics', 'anthropometry-series', p] as const;

export function useAnthropometrySeries(params: AnthropometryParams, enabled = true) {
  const customSlots = params.customSlots ?? [];
  return useQuery({
    queryKey: anthropometryKey(params),
    // Fetch when at least one standard parameter OR custom slot is selected.
    enabled: enabled && (params.parameters.length > 0 || customSlots.length > 0),
    // A client can revoke a trainer's access while an earlier chart is cached.
    refetchInterval: 10_000,
    refetchOnMount: params.clientId ? 'always' : true,
    refetchOnWindowFocus: params.clientId ? 'always' : true,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/analytics/anthropometry/series', {
        params: {
          query: {
            date_from: params.dateFrom,
            date_to: params.dateTo,
            parameters: params.parameters,
            custom_slots: customSlots.length > 0 ? customSlots : undefined,
            client_id: params.clientId,
          },
        },
      });
      if (error) throw toApiError(error);
      return data;
    },
  });
}
