import { useMutation } from '@tanstack/react-query';

import { api, toApiError } from '@/shared/api/client';
import type { components } from '@/shared/api/schema';

type ResendCodeRequest = components['schemas']['ResendCodeRequest'];

export function useResendCode() {
  return useMutation({
    mutationFn: async (body: ResendCodeRequest) => {
      const { data, error } = await api.POST('/api/v1/auth/resend-code', { body });
      if (error) {
        throw toApiError(error);
      }
      return data;
    },
  });
}
