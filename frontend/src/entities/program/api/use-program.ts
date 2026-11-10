import { useQuery } from '@tanstack/react-query';

import { api, toApiError } from '@/shared/api/client';

export const programKey = (id: string) => ['programs', 'detail', id] as const;

export function useProgram(id: string | null, refreshOnMount = false) {
  return useQuery({
    queryKey: programKey(id ?? ''),
    enabled: id !== null && id !== '',
    refetchOnMount: refreshOnMount ? 'always' : undefined,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/programs/{program_id}', {
        params: { path: { program_id: id as string } },
      });
      if (error) throw toApiError(error);
      return data;
    },
  });
}
