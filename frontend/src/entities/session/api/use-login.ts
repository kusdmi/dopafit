import { useMutation } from '@tanstack/react-query';

import { api, toApiError } from '@/shared/api/client';
import type { components } from '@/shared/api/schema';
import { trackMetrikaContext, trackMetrikaGoal } from '@/shared/lib/telemetry/metrika';

import { useSessionStore } from '../model/store';

type LoginRequest = components['schemas']['LoginRequest'];

export function useLogin() {
  const setSession = useSessionStore((state) => state.setSession);

  return useMutation({
    mutationFn: async (body: LoginRequest) => {
      const { data, error } = await api.POST('/api/v1/auth/login', { body });
      if (error) {
        throw toApiError(error);
      }
      return data;
    },
    onSuccess: async (auth, body) => {
      await setSession(auth);
      trackMetrikaContext(auth.user.role);
      trackMetrikaGoal('login_succeeded', {
        method: body.challenge_token ? 'two_factor' : 'password',
      });
    },
  });
}
