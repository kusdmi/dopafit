import { useUpdateSettings } from '@/entities/user/api/use-settings';

import { useAnalyticsConfig } from './useAnalyticsConfig';
import type { AnalyticsConfig, BodyParameter } from './types';

/**
 * Persists the home screen's own preferences into the user's settings, alongside
 * the rest of the analytics config.
 *
 * They ride inside the free-form `analytics_config` JSON, the same place
 * `photo_compare_visible` lives — the contract types that field as an open
 * object, so storing a few more keys needs no contract or backend change. The
 * whole config is written back because the settings endpoint replaces the field
 * wholesale rather than merging into it.
 */
function useSaveHomeConfig(): (patch: Partial<AnalyticsConfig>) => void {
  const { config } = useAnalyticsConfig();
  const update = useUpdateSettings();

  return (patch) => {
    update.mutate({ analytics_config: { ...config, ...patch } });
  };
}

export function useSaveHomeParameter(): (parameter: BodyParameter) => void {
  const save = useSaveHomeConfig();
  return (parameter) => save({ home_measurement_parameter: parameter });
}

export function useSaveHomeStrengthExercise(): (exerciseId: string) => void {
  const save = useSaveHomeConfig();
  return (exerciseId) => save({ home_strength_exercise_id: exerciseId });
}

export function useSaveHomeRecordExercise(): (exerciseId: string) => void {
  const save = useSaveHomeConfig();
  return (exerciseId) => save({ home_record_exercise_id: exerciseId });
}
