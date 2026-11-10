import { safeRandomUUID } from '@/shared/lib/uuid';

import type { AnalyticsConfig, ChartConfig } from './types';
import { CONFIG_VERSION } from './types';

export function makeDefaultConfig(): AnalyticsConfig {
  const charts: ChartConfig[] = [
    {
      id: safeRandomUUID(),
      type: 'workouts',
      visible: true,
      period: null,
      date_from: null,
      date_to: null,
      params: { view: 'program', programId: '', dayId: '', exerciseId: '', metric: 'weight' },
    },
    {
      id: safeRandomUUID(),
      type: 'anthropometry',
      visible: true,
      period: null,
      date_from: null,
      date_to: null,
      params: { parameters: ['weight'] },
    },
  ];
  return { version: CONFIG_VERSION, default_period: '90d', charts, photo_compare_visible: true };
}

// On-the-fly migration: an empty/null/broken stored config becomes the default,
// so existing users (analytics_config === null) keep working without a data migration.
export function migrateConfig(raw: unknown): AnalyticsConfig {
  if (!raw || typeof raw !== 'object') return makeDefaultConfig();
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.charts)) return makeDefaultConfig();
  if (typeof obj.default_period !== 'string') return makeDefaultConfig();
  return {
    version: typeof obj.version === 'number' ? obj.version : CONFIG_VERSION,
    default_period: obj.default_period as AnalyticsConfig['default_period'],
    charts: obj.charts as ChartConfig[],
    ...(typeof obj.photo_compare_visible === 'boolean'
      ? { photo_compare_visible: obj.photo_compare_visible }
      : {}),
    ...(typeof obj.home_measurement_parameter === 'string'
      ? {
          home_measurement_parameter:
            obj.home_measurement_parameter as AnalyticsConfig['home_measurement_parameter'],
        }
      : {}),
    ...(typeof obj.home_strength_exercise_id === 'string'
      ? { home_strength_exercise_id: obj.home_strength_exercise_id }
      : {}),
    ...(typeof obj.home_record_exercise_id === 'string'
      ? { home_record_exercise_id: obj.home_record_exercise_id }
      : {}),
  };
}
