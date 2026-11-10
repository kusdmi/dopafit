import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { api, toApiError } from '@/shared/api/client';
import type { components } from '@/shared/api/schema';

export type SubscriptionStatus = components['schemas']['SubscriptionStatusOut'];

export const subscriptionStatusQueryKey = ['subscription', 'status'] as const;

export function useSubscriptionStatus() {
  const qc = useQueryClient();
  const [now, setNow] = useState(Date.now);
  const query = useQuery({
    refetchInterval: 30_000,
    queryKey: subscriptionStatusQueryKey,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/subscriptions/status');
      if (error) {
        throw toApiError(error);
      }
      return data;
    },
  });
  const expires = query.data?.ends_at ? Date.parse(query.data.ends_at) : Infinity;
  const serverTime = query.data?.entitlements?.server_time;
  const offset = serverTime ? Date.parse(serverTime) - query.dataUpdatedAt : 0;
  const active = !!query.data?.is_active && now + offset < expires;
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);
  useEffect(() => {
    if (query.data?.is_active && !active) {
      void qc.invalidateQueries({ queryKey: ['analytics'] });
      void qc.invalidateQueries({ queryKey: subscriptionStatusQueryKey });
    }
  }, [active, query.data?.is_active, qc]);
  const access = query.data?.entitlements;
  const expired = access?.is_active && !active;
  return {
    ...query,
    serverNow: now + offset,
    data: query.data
      ? {
          ...query.data,
          is_active: active,
          entitlements: access
            ? {
                ...access,
                is_active: active,
                limits: expired ? access.free_limits : access.limits,
                features: expired
                  ? {
                      rest_timer: false,
                      average_rest: false,
                      share_results: false,
                      analytics_days: 30,
                    }
                  : access.features,
              }
            : undefined,
        }
      : query.data,
  };
}
