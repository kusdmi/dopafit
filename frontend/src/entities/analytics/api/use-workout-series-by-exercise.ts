import { useQuery } from '@tanstack/react-query';

import { api, toApiError } from '@/shared/api/client';

export interface WorkoutSeriesByExerciseParams {
  dateFrom: string;
  dateTo: string;
  clientId?: string;
  programId?: string;
  dayId?: string;
  exerciseId?: string;
}

export const workoutSeriesByExerciseKey = (p: WorkoutSeriesByExerciseParams) =>
  ['analytics', 'workout-series-by-exercise', p] as const;

/**
 * The workout series split into one entry per exercise.
 *
 * The analytics screen draws a card per exercise of the selected program day;
 * `useWorkoutSeries` averages them into a single line, which is what the home
 * dashboard wants and this screen cannot use.
 */
export function useWorkoutSeriesByExercise(params: WorkoutSeriesByExerciseParams, enabled = true) {
  return useQuery({
    queryKey: workoutSeriesByExerciseKey(params),
    enabled,
    refetchInterval: params.clientId ? 10_000 : false,
    refetchOnMount: params.clientId ? 'always' : true,
    refetchOnWindowFocus: params.clientId ? 'always' : true,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/analytics/workouts/series-by-exercise', {
        params: {
          query: {
            date_from: params.dateFrom,
            date_to: params.dateTo,
            client_id: params.clientId,
            program_id: params.programId,
            day_id: params.dayId,
            exercise_id: params.exerciseId,
          },
        },
      });
      if (error) throw toApiError(error);
      return data;
    },
  });
}
