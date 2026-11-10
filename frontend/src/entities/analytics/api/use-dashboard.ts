import { useQuery } from '@tanstack/react-query';

import { api, toApiError } from '@/shared/api/client';
import type { components } from '@/shared/api/schema';

type BodyParameter = components['schemas']['BodyParameter'];
type DashboardPeriod = components['schemas']['DashboardPeriod'];

export interface DashboardParams {
  measurementParameter?: BodyParameter;
  recordExerciseId?: string;
  strengthExerciseId?: string;
  period?: DashboardPeriod;
}

export const dashboardKey = (p: DashboardParams) => ['analytics', 'dashboard', p] as const;

export function useDashboard(params: DashboardParams = {}) {
  return useQuery({
    queryKey: dashboardKey(params),
    // Смена параметра (замер, упражнение рекорда, упражнение графика) меняет
    // КЛЮЧ запроса, а у нового ключа своих данных ещё нет — без этого `data`
    // на время загрузки становится undefined, значения схлопываются в прочерки,
    // графики пустеют и тут же возвращаются. Экран заметно дёргался на каждом
    // выборе.
    //
    // keepPreviousData оставляет на экране прошлый ответ, пока едет новый:
    // раскладка не меняется, подменяются только числа. Это ровно тот случай,
    // для которого placeholderData и предназначен — соседний набор тех же
    // данных, а не заглушка.
    placeholderData: (previous) => previous,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/analytics/dashboard', {
        params: {
          query: {
            measurement_parameter: params.measurementParameter,
            record_exercise_id: params.recordExerciseId,
            strength_exercise_id: params.strengthExerciseId,
            period: params.period,
          },
        },
      });
      if (error) throw toApiError(error);
      return data;
    },
  });
}
