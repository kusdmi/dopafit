import { useMutation } from '@tanstack/react-query';

import { api, toApiError } from '@/shared/api/client';
import type { components } from '@/shared/api/schema';

import { useSessionStore } from '../model/store';

type RegisterVerifyRequest = components['schemas']['RegisterVerifyRequest'];

/** Completes registration with the emailed code; signs the user in. */
export function useRegisterVerify() {
  const setSession = useSessionStore((state) => state.setSession);

  return useMutation({
    mutationFn: async (body: RegisterVerifyRequest) => {
      const { data, error } = await api.POST('/api/v1/auth/register/verify', { body });
      if (error) {
        throw toApiError(error);
      }
      return data;
    },
    onSuccess: async (auth) => {
      await setSession(auth);
    },
  });
}
