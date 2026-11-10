import { useQuery } from '@tanstack/react-query';

import { api, toApiError } from '@/shared/api/client';

export const calendarMonthKey = (year: number, month: number) =>
  ['calendar', 'month', year, month] as const;

export function useCalendarMonth(year: number, month: number) {
  return useQuery({
    queryKey: calendarMonthKey(year, month),
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/calendar/month', {
        params: { query: { year, month } },
      });
      if (error) throw toApiError(error);
      return data;
    },
  });
}
