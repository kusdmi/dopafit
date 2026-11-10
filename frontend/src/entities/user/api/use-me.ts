import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useSessionStore } from '@/entities/session/@x/user';
import { api, toApiError } from '@/shared/api/client';
import type { components } from '@/shared/api/schema';
import { tokenStorage } from '@/shared/api/tokens';

type UpdateMeRequest = components['schemas']['UpdateMeRequest'];

export const meQueryKey = (userId: string) => ['users', userId, 'me'] as const;

export function useMe() {
  const userId = useSessionStore((state) => state.user?.id ?? 'anonymous');

  return useQuery({
    queryKey: meQueryKey(userId),
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/users/me');
      if (error) {
        throw toApiError(error);
      }
      return data;
    },
  });
}

export function useUpdateMe() {
  const queryClient = useQueryClient();
  const setSession = useSessionStore((state) => state.setSession);

  return useMutation({
    mutationFn: async (body: UpdateMeRequest) => {
      const { data, error } = await api.PATCH('/api/v1/users/me', { body });
      if (error) {
        throw toApiError(error);
      }
      return data;
    },
    onSuccess: async (me) => {
      queryClient.setQueryData(meQueryKey(me.user.id), me);
      const access = await tokenStorage.getAccess();
      const refresh = await tokenStorage.getRefresh();
      if (access && refresh) {
        await setSession({
          user: me.user,
          tokens: { access_token: access, refresh_token: refresh, token_type: 'bearer' },
        });
      }
    },
  });
}
