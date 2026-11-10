import { useQueryClient } from '@tanstack/react-query';

import type { components } from '@/shared/api/schema';

import { meQueryKey } from './use-me';

type MeOut = components['schemas']['MeOut'];
type UserOut = components['schemas']['UserOut'];

/** Confirm/mutation endpoints return a bare UserOut; merge it into the cached
 *  MeOut so the profile screens see the fresh contact/login-method state. */
export function useApplyUser() {
  const queryClient = useQueryClient();
  return (user: UserOut) => {
    queryClient.setQueryData<MeOut>(meQueryKey(user.id), (me) => (me ? { ...me, user } : me));
  };
}
