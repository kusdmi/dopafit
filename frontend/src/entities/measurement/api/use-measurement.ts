import { useQuery, useQueryClient } from '@tanstack/react-query';

import { api, toApiError } from '@/shared/api/client';

export function useMeasurement(id: string | null) {
  const qc = useQueryClient();
  const pending = qc
    .getQueryData<{
      items: (import('@/shared/api/schema').components['schemas']['MeasurementOut'] & {
        __pendingSync?: boolean;
      })[];
    }>(['measurements', 'list'])
    ?.items.find((m) => m.id === id && m.__pendingSync);
  return useQuery({
    initialData: pending,
    queryKey: ['measurements', id],
    enabled: id !== null && !pending,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/measurements/{measurement_id}', {
        params: { path: { measurement_id: id! } },
      });
      if (error) throw toApiError(error);
      return data;
    },
  });
}
