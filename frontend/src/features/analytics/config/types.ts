import type { components } from '@/shared/api/schema';

export type BodyParameter = components['schemas']['BodyParameter'];
export type WorkoutMetric = components['schemas']['WorkoutMetric'];
export type WorkoutView = 'program' | 'exercise';

export type ChartType = 'workouts' | 'anthropometry';
export type PeriodPreset = '30d' | '90d' | '180d' | '365d' | 'custom';

export interface WorkoutParams {
  view: WorkoutView;
  programId: string;
  dayId: string;
  exerciseId: string;
  metric: WorkoutMetric;
}

export interface AnthropometryParams {
  parameters: BodyParameter[];
  // Custom measurement-field slots (1..3) to chart alongside standard params.
  // Optional for back-compat with configs saved before custom fields existed.
  customSlots?: number[];
}

// Free-form on the wire; the registry narrows by `type` at render time.
export interface ChartConfig {
  id: string;
  type: ChartType;
  visible: boolean;
  period: PeriodPreset | null;
  date_from: string | null;
  date_to: string | null;
  params: Record<string, unknown>;
}

export interface AnalyticsConfig {
  version: number;
  default_period: PeriodPreset;
  charts: ChartConfig[];
  // Whether the "Сравнение фото" block is shown on the analytics page. Optional &
  // treated as true when absent, for compat with configs saved before this field.
  // Stored inside the free-form analytics_config JSON — no backend/contract change.
  photo_compare_visible?: boolean;
  // Which body parameter the home screen's measurement banner charts. The picker
  // itself already existed on Home; without this the choice reset to "weight" on
  // every mount. Optional, like photo_compare_visible, and stored in the same
  // free-form analytics_config JSON — the contract types it as an open object
  // (additionalProperties), so no contract or backend change is involved.
  home_measurement_parameter?: BodyParameter;
  // Which exercise the home screen's strength chart follows. Same free-form slot
  // and same reasoning as home_measurement_parameter above; absent means "follow
  // the personal record", which is what the backend defaults to.
  home_strength_exercise_id?: string;
  // Which exercise the home screen's PERSONAL RECORD card shows. Deliberately a
  // separate key from home_strength_exercise_id: the record card and the
  // strength chart are two independent pickers (the backend has taken
  // record_exercise_id and strength_exercise_id apart from the start), and
  // sharing one key made a pick in the record card silently repoint the chart
  // below. Absent means "the heaviest lift overall", the backend's default.
  home_record_exercise_id?: string;
}

export const CONFIG_VERSION = 1;
export const PERIOD_PRESETS: PeriodPreset[] = ['30d', '90d', '180d', '365d', 'custom'];
export const KNOWN_CHART_TYPES: ChartType[] = ['workouts', 'anthropometry'];
