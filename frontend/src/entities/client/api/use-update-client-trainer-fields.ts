import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api, toApiError } from '@/shared/api/client';
import type { components } from '@/shared/api/schema';

import { clientKey } from './use-client';
import { clientsListKey } from './use-clients';

type Body = components['schemas']['ClientTrainerFieldsUpdateRequest'];

/**
 * Edits trainer-owned card fields (today: note) via PATCH /clients/{id}/trainer-fields.
 * Works for ANY client the trainer owns — managed OR linked — unlike the general update.
 */
export function useUpdateClientTrainerFields(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Body) => {
      const { data, error } = await api.PATCH('/api/v1/clients/{client_id}/trainer-fields', {
        params: { path: { client_id: id } },
        body,
      });
      if (error) throw toApiError(error);
      return data;
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: clientsListKey });
      void qc.invalidateQueries({ queryKey: clientKey(id) });
    },
  });
}
