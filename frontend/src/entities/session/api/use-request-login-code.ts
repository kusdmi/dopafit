import { useMutation } from '@tanstack/react-query';

import { api, toApiError } from '@/shared/api/client';
import type { components } from '@/shared/api/schema';

type LoginCodeRequest = components['schemas']['LoginCodeRequest'];

/** Requests a login code. The server responds uniformly for known and unknown
 *  contacts (anti-enumeration); the UI always proceeds to the OTP screen. */
export function useRequestLoginCode() {
  return useMutation({
    mutationFn: async (body: LoginCodeRequest) => {
      const { data, error } = await api.POST('/api/v1/auth/login/request-code', { body });
      if (error) {
        throw toApiError(error);
      }
      return data;
    },
  });
}
