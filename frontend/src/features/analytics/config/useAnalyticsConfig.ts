import { useMemo } from 'react';

import { useSettings } from '@/entities/user/api/use-settings';

import { migrateConfig } from './defaults';
import type { AnalyticsConfig } from './types';

export function useAnalyticsConfig(): { config: AnalyticsConfig; isLoading: boolean } {
  const settings = useSettings();
  const config = useMemo(
    () => migrateConfig(settings.data?.analytics_config ?? null),
    [settings.data?.analytics_config],
  );
  return { config, isLoading: settings.isLoading };
}
