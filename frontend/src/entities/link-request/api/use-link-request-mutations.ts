import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api, toApiError } from '@/shared/api/client';
import type { components } from '@/shared/api/schema';

// This entity hook invalidates only its own ['link-requests'] queries. Accepting a
// request also creates a client card, but that cross-entity refresh (clientsListKey)
// is wired in the consuming feature layer (RequestList), keeping entities horizontally
// isolated per FSD.

type CreateBody = components['schemas']['LinkRequestCreateRequest'];

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['link-requests'] });
}

export function useCreateLinkRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateBody) => {
      const { data, error } = await api.POST('/api/v1/link-requests', { body });
      if (error) throw toApiError(error);
      return data;
    },
    onSettled: () => invalidateAll(qc),
  });
}

function useRequestTransition(kind: 'accept' | 'decline') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const path =
        kind === 'accept'
          ? '/api/v1/link-requests/{request_id}/accept'
          : '/api/v1/link-requests/{request_id}/decline';
      const { data, error } = await api.POST(path, {
        params: { path: { request_id: id } },
      });
      if (error) throw toApiError(error);
      return data;
    },
    onSettled: () => invalidateAll(qc),
  });
}

export const useAcceptLinkRequest = () => useRequestTransition('accept');
export const useDeclineLinkRequest = () => useRequestTransition('decline');

export function useCancelLinkRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE('/api/v1/link-requests/{request_id}', {
        params: { path: { request_id: id } },
      });
      if (error) throw toApiError(error);
    },
    onSettled: () => invalidateAll(qc),
  });
}
