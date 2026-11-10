import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api, toApiError } from '@/shared/api/client';
import type { components } from '@/shared/api/schema';

import { clientKey } from './use-client';
import { clientsKeyRoot, clientsListKey } from './use-clients';

type ClientCreateRequest = components['schemas']['ClientCreateRequest'];
type ClientUpdateRequest = components['schemas']['ClientUpdateRequest'];

export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: ClientCreateRequest) => {
      const { data, error } = await api.POST('/api/v1/clients', { body });
      if (error) throw toApiError(error);
      return data;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: clientsListKey }),
  });
}

export function useUpdateClient(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: ClientUpdateRequest) => {
      const { data, error } = await api.PUT('/api/v1/clients/{client_id}', {
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

function useStatusAction(
  path:
    | '/api/v1/clients/{client_id}/unlink'
    | '/api/v1/clients/{client_id}/archive'
    | '/api/v1/clients/{client_id}/unarchive',
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.POST(path, { params: { path: { client_id: id } } });
      if (error) throw toApiError(error);
    },
    // Unlinking ends the relationship, not just a card's status, so the whole
    // ['clients'] prefix goes stale at once — the roster, the single-client
    // cache the edit page reads (['clients', id]) and the client's own view of
    // who their trainer is. One prefix covers all three.
    onSettled: () => void qc.invalidateQueries({ queryKey: clientsKeyRoot }),
  });
}

export const useUnlinkClient = () => useStatusAction('/api/v1/clients/{client_id}/unlink');
export const useArchiveClient = () => useStatusAction('/api/v1/clients/{client_id}/archive');
export const useUnarchiveClient = () =>
  useStatusAction('/api/v1/clients/{client_id}/unarchive');
