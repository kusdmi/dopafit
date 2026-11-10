import { useMutation } from '@tanstack/react-query';

import { api, toApiError } from '@/shared/api/client';
import type { components } from '@/shared/api/schema';
import { trackMetrikaContext, trackMetrikaGoal } from '@/shared/lib/telemetry/metrika';

import { useSessionStore } from '../model/store';

type LoginCodeVerifyRequest = components['schemas']['LoginCodeVerifyRequest'];

/** Verifies the login code. Signs in immediately unless the account uses 2FA,
 *  in which case the response carries a challenge token for the password step. */
export function useVerifyLoginCode() {
  const setSession = useSessionStore((state) => state.setSession);

  return useMutation({
    mutationFn: async (body: LoginCodeVerifyRequest) => {
      const { data, error } = await api.POST('/api/v1/auth/login/verify-code', { body });
      if (error) {
        throw toApiError(error);
      }
      return data;
    },
    onSuccess: async (response) => {
      if (response.auth) {
        await setSession(response.auth);
        trackMetrikaContext(response.auth.user.role);
        trackMetrikaGoal('login_succeeded', { method: 'code' });
      }
    },
  });
}
