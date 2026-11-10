import { useQuery } from '@tanstack/react-query';

import { api, toApiError } from '@/shared/api/client';
import { STALE_REFERENCE_DATA } from '@/shared/lib/query/stale-times';

export const categoriesKey = ['exercises', 'categories'] as const;

export function useCategories() {
  return useQuery({
    queryKey: categoriesKey,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/exercises/categories');
      if (error) throw toApiError(error);
      return data;
    },
    // Справочник, а не пользовательские данные — см. STALE_REFERENCE_DATA.
    staleTime: STALE_REFERENCE_DATA,
  });
}
