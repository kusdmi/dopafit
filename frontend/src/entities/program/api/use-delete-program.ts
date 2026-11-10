import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api, toApiError } from '@/shared/api/client';

import { programsListKey } from './use-programs';

export function useDeleteProgram() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE('/api/v1/programs/{program_id}', {
        params: { path: { program_id: id } },
      });
      if (error) throw toApiError(error);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: programsListKey }),
  });
}
