import { useMutation } from '@tanstack/react-query';

import { api, toApiError } from '@/shared/api/client';

export function useShareProgram(programId: string) {
  return useMutation({
    mutationFn: async (clientId: string) => {
      const { data, error } = await api.POST('/api/v1/programs/{program_id}/share', {
        params: { path: { program_id: programId } },
        body: { client_id: clientId },
      });
      if (error) throw toApiError(error);
      return data;
    },
  });
}
