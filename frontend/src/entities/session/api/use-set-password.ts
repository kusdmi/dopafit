import { useMutation } from '@tanstack/react-query';

import { api, toApiError } from '@/shared/api/client';
import type { components } from '@/shared/api/schema';

import { useSessionStore } from '../model/store';

type SetPasswordRequest = components['schemas']['SetPasswordRequest'];

export function useSetPassword() {
  const setSession = useSessionStore((state) => state.setSession);

  return useMutation({
    mutationFn: async (body: SetPasswordRequest) => {
      const { data, error } = await api.POST('/api/v1/auth/set-password', { body });
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
