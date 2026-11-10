import { useMutation } from '@tanstack/react-query';

import { api, toApiError } from '@/shared/api/client';
import type { components } from '@/shared/api/schema';

type DeleteAccountRequest = components['schemas']['DeleteAccountRequest'];
type DeleteAccountConfirmRequest = components['schemas']['DeleteAccountConfirmRequest'];

/** Starts account deletion: the server picks the identity check (code or
 *  password) from the user's login method. */
export function useDeleteAccountRequest() {
  return useMutation({
    mutationFn: async (body: DeleteAccountRequest) => {
      const { data, error } = await api.POST('/api/v1/users/me/delete-request', { body });
      if (error) {
        throw toApiError(error);
      }
      return data;
    },
  });
}

/** Irreversibly anonymizes the account. The caller handles the teardown. */
export function useDeleteAccountConfirm() {
  return useMutation({
    mutationFn: async (body: DeleteAccountConfirmRequest) => {
      const { data, error } = await api.POST('/api/v1/users/me/delete-confirm', { body });
      if (error) {
        throw toApiError(error);
      }
      return data;
    },
  });
}
