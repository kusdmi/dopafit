import { useMutation } from '@tanstack/react-query';

import { api, toApiError } from '@/shared/api/client';
import type { components } from '@/shared/api/schema';

import { useApplyUser } from './use-apply-user';

type ContactVerifyRequest = components['schemas']['ContactVerifyRequest'];
type ContactVerifyConfirmRequest = components['schemas']['ContactVerifyConfirmRequest'];
type ContactChangeRequest = components['schemas']['ContactChangeRequest'];
type ContactChangeConfirmRequest = components['schemas']['ContactChangeConfirmRequest'];

export function useContactVerifyRequest() {
  return useMutation({
    mutationFn: async (body: ContactVerifyRequest) => {
      const { data, error } = await api.POST('/api/v1/users/me/contact/verify-request', {
        body,
      });
      if (error) {
        throw toApiError(error);
      }
      return data;
    },
  });
}

export function useContactVerifyConfirm() {
  const applyUser = useApplyUser();
  return useMutation({
    mutationFn: async (body: ContactVerifyConfirmRequest) => {
      const { data, error } = await api.POST('/api/v1/users/me/contact/verify-confirm', {
        body,
      });
      if (error) {
        throw toApiError(error);
      }
      return data;
    },
    onSuccess: applyUser,
  });
}

export function useContactChangeRequest() {
  return useMutation({
    mutationFn: async (body: ContactChangeRequest) => {
      const { data, error } = await api.POST('/api/v1/users/me/contact/change-request', {
        body,
      });
      if (error) {
        throw toApiError(error);
      }
      return data;
    },
  });
}

export function useContactChangeConfirm() {
  const applyUser = useApplyUser();
  return useMutation({
    mutationFn: async (body: ContactChangeConfirmRequest) => {
      const { data, error } = await api.POST('/api/v1/users/me/contact/change-confirm', {
        body,
      });
      if (error) {
        throw toApiError(error);
      }
      return data;
    },
    onSuccess: applyUser,
  });
}
