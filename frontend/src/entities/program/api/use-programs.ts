import { useQuery } from '@tanstack/react-query';

import { api, toApiError } from '@/shared/api/client';

export const programsListKey = ['programs', 'list'] as const;

export function usePrograms() {
  return useQuery({
    queryKey: programsListKey,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/programs');
      if (error) throw toApiError(error);
      // Real contract returns ProgramListItem[] array directly
      return data;
    },
  });
}
