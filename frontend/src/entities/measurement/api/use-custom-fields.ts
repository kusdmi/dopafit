import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, toApiError } from '@/shared/api/client';

const key = ['measurements', 'custom-fields'] as const;

/**
 * Lists custom measurement field definitions. Without clientId → the caller's own
 * fields. With a clientId (a TrainerClient card UUID) → the linked client's
 * fields, so a trainer building a chart in "Клиент" mode sees the CLIENT's field
 * names (the trainer may have none of their own). The clientId is part of the
 * query key so switching target refetches the right set.
 */
export function useCustomFields(clientId?: string | null) {
  return useQuery({
    queryKey: clientId ? ([...key, clientId] as const) : key,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/measurements/custom-fields', {
        params: { query: clientId ? { client_id: clientId } : {} },
      });
      if (error) throw toApiError(error);
      return data;
    },
  });
}

export function useUpsertCustomField() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { slot: number; name: string; unit: string }) => {
      const { data, error } = await api.PUT('/api/v1/measurements/custom-fields/{slot}', {
        params: { path: { slot: vars.slot } },
        body: { name: vars.name, unit: vars.unit },
      });
      if (error) throw toApiError(error);
      return data;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}
