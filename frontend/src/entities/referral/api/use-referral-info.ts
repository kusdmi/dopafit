import { useQuery } from '@tanstack/react-query';

import { api, toApiError } from '@/shared/api/client';
import type { components } from '@/shared/api/schema';

export type ReferralInfo = components['schemas']['ReferralInfoOut'];

export const referralInfoQueryKey = ['referral', 'me'] as const;

export function useReferralInfo() {
  return useQuery({
    queryKey: referralInfoQueryKey,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/referrals/me');
      if (error) {
        throw toApiError(error);
      }
      return data;
    },
  });
}
