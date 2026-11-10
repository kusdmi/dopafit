import { useMutation } from '@tanstack/react-query';

import { api, toApiError } from '@/shared/api/client';
import type { components } from '@/shared/api/schema';

type VerifyCodeRequest = components['schemas']['VerifyCodeRequest'];

export function useVerifyCode() {
  return useMutation({
    mutationFn: async (body: VerifyCodeRequest) => {
      const { data, error } = await api.POST('/api/v1/auth/verify-code', { body });
      if (error) {
        throw toApiError(error);
      }
      return data;
    },
  });
}
