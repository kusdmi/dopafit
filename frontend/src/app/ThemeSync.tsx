import { useEffect } from 'react';

import { useSessionStore } from '@/entities/session/model/store';
import { useSettings } from '@/entities/user/api/use-settings';
import { applyStatusBarTheme } from '@/shared/lib/platform/status-bar/status-bar';
import {
  applyThemeColor,
  isEffectiveDark,
  isThemePreference,
  subscribeToSchemeChange,
} from '@/shared/lib/theme/theme';
import { setThemePreference, useThemePreference } from '@/shared/lib/theme/useTheme';

/**
 * Keeps the applied theme in sync with the server-side user preference.
 * Before login (and on first paint) the locally cached preference is used,
 * so this only reconciles once settings load for an authenticated user.
 *
 * Also mirrors the effective light/dark theme onto the native status-bar style
 * whenever the active preference changes (no-op on web). For pref='system' it
 * additionally re-applies the status-bar style when the OS flips its scheme
 * (e.g. iOS scheduled dark mode) so it doesn't stay unreadable until the user
 * manually toggles the preference.
 */
export function ThemeSync() {
  const isAuthenticated = useSessionStore((state) => state.isAuthenticated);
  const { data: settings } = useSettings();
  const theme = settings?.theme;
  const pref = useThemePreference();

  useEffect(() => {
    if (isAuthenticated && isThemePreference(theme)) {
      setThemePreference(theme);
    }
  }, [isAuthenticated, theme]);

  useEffect(() => {
    void applyStatusBarTheme(isEffectiveDark(pref));
    if (pref !== 'system') return;
    // Only the 'system' preference tracks the OS scheme, so subscribe for it.
    // `applyTheme` already retints the web chrome for an explicit light/dark
    // choice; under 'system' the preference never changes when the OS flips,
    // so the meta has to be rewritten from here too.
    return subscribeToSchemeChange(() => {
      const isDark = isEffectiveDark(pref);
      applyThemeColor(isDark);
      void applyStatusBarTheme(isDark);
    });
  }, [pref]);

  return null;
}
