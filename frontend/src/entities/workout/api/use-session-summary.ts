import { useQuery } from '@tanstack/react-query';

import { api, toApiError } from '@/shared/api/client';

export const sessionSummaryKey = (sessionId: string) => ['workouts', 'summary', sessionId] as const;

export function useSessionSummary(sessionId: string) {
  return useQuery({
    queryKey: sessionSummaryKey(sessionId),
    enabled: sessionId !== '',
    refetchOnMount: 'always',
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/workouts/sessions/{session_id}/summary', {
        params: { path: { session_id: sessionId } },
      });
      if (error) throw toApiError(error);
      return data;
    },
  });
}
