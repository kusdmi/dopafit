import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api, toApiError } from '@/shared/api/client';

import { subscriptionStatusQueryKey, type SubscriptionStatus } from './use-subscription-status';

export function useSetAutoRenew() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await api.POST('/api/v1/subscriptions/auto-renew', {
        body: { enabled },
      });
      if (error) throw toApiError(error);
      return enabled;
    },
    onSuccess: (enabled) => {
      queryClient.setQueryData<SubscriptionStatus>(subscriptionStatusQueryKey, (current) =>
        current ? { ...current, auto_renew: enabled } : current,
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: subscriptionStatusQueryKey });
    },
  });
}
