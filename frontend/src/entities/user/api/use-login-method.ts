import { useMutation } from '@tanstack/react-query';

import { api, toApiError } from '@/shared/api/client';
import type { components } from '@/shared/api/schema';

import { useApplyUser } from './use-apply-user';

type LoginMethodCodeRequest = components['schemas']['LoginMethodCodeRequest'];
type SetLoginMethodRequest = components['schemas']['SetLoginMethodRequest'];

/** Sends the confirmation code required to switch the login method. */
export function useLoginMethodRequestCode() {
  return useMutation({
    mutationFn: async (body: LoginMethodCodeRequest) => {
      const { data, error } = await api.POST('/api/v1/users/me/login-method/request-code', {
        body,
      });
      if (error) {
        throw toApiError(error);
      }
      return data;
    },
  });
}

export function useSetLoginMethod() {
  const applyUser = useApplyUser();
  return useMutation({
    mutationFn: async (body: SetLoginMethodRequest) => {
      const { data, error } = await api.PUT('/api/v1/users/me/login-method', { body });
      if (error) {
        throw toApiError(error);
      }
      return data;
    },
    onSuccess: applyUser,
  });
}
