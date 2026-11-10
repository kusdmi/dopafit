import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useSessionStore } from '@/entities/session/@x/user';
import { meQueryKey } from '@/entities/user/api/use-me';
import { api, toApiError } from '@/shared/api/client';
import type { components } from '@/shared/api/schema';

type ChangePasswordRequest = components['schemas']['ChangePasswordRequest'];

export function useChangePassword() {
  const queryClient = useQueryClient();
  const userId = useSessionStore((state) => state.user?.id ?? 'anonymous');

  return useMutation({
    mutationFn: async (body: ChangePasswordRequest) => {
      const { data, error } = await api.POST('/api/v1/users/me/change-password', { body });
      if (error) {
        throw toApiError(error);
      }
      return data;
    },
    // Ответ change-password = OkResponse (НЕ UserOut), поэтому кэш me нельзя
    // обновить точечно — инвалидируем, чтобы секция «Безопасность» перестроилась
    // (has_password → доступные варианты входа) сразу, без перезагрузки.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: meQueryKey(userId) });
    },
  });
}
