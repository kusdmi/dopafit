import { useMutation } from '@tanstack/react-query';

import { api, toApiError } from '@/shared/api/client';
import type { components } from '@/shared/api/schema';

type RegisterRequest = components['schemas']['RegisterRequest'];

export function useRegister() {
  return useMutation({
    mutationFn: async (body: RegisterRequest) => {
      const { data, error } = await api.POST('/api/v1/auth/register', { body });
      if (error) {
        throw toApiError(error);
      }
      return data;
    },
  });
}
