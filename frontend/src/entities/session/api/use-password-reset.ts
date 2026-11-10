import { useMutation } from '@tanstack/react-query';

import { api, toApiError } from '@/shared/api/client';
import type { components } from '@/shared/api/schema';

type PasswordResetRequest = components['schemas']['PasswordResetRequest'];
type PasswordResetConfirmRequest = components['schemas']['PasswordResetConfirmRequest'];

export function useRequestPasswordReset() {
  return useMutation({
    mutationFn: async (body: PasswordResetRequest) => {
      const { data, error } = await api.POST('/api/v1/auth/password-reset/request', { body });
      if (error) {
        throw toApiError(error);
      }
      return data;
    },
  });
}

export function useConfirmPasswordReset() {
  return useMutation({
    mutationFn: async (body: PasswordResetConfirmRequest) => {
      const { data, error } = await api.POST('/api/v1/auth/password-reset/confirm', { body });
      if (error) {
        throw toApiError(error);
      }
      return data;
    },
  });
}
