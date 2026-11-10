import { useQuery } from '@tanstack/react-query';

import type { components } from '@/shared/api/schema';
import { api, toApiError } from '@/shared/api/client';

export const measurementsListKey = ['measurements', 'list'] as const;

export async function fetchMeasurements(clientId?: string) {
  const items: components['schemas']['MeasurementOut'][] = [];
  let offset = 0;
  let total = 0;
  do {
    const { data, error } = await api.GET('/api/v1/measurements', {
      params: { query: { client_id: clientId, limit: 100, offset } },
    });
    if (error || !data) throw toApiError(error);
    items.push(...data.items);
    offset += data.items.length;
    total = data.total;
    if (!data.items.length) break;
  } while (offset < total);
  return { items: [...new Map(items.map((item) => [item.id, item])).values()], total };
}

export function useMeasurements() {
  return useQuery({ queryKey: measurementsListKey, queryFn: () => fetchMeasurements() });
}
