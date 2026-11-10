import { useMutation } from '@tanstack/react-query';

import { api } from '@/shared/api/client';
import { tokenStorage } from '@/shared/api/tokens';

import { useSessionStore } from '../model/store';

export function useLogout() {
  const clearSession = useSessionStore((state) => state.clearSession);

  return useMutation({
    mutationFn: async () => {
      const refreshToken = await tokenStorage.getRefresh();
      if (refreshToken) {
        await api.POST('/api/v1/auth/logout', { body: { refresh_token: refreshToken } });
      }
    },
    onSettled: async () => {
      await clearSession();
    },
  });
}
