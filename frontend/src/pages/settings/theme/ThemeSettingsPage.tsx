import { Icon } from '@/shared/ui/primitives';
import { checkmarkCircle } from '@/shared/ui/icons';
import { useEffect, useRef, useState } from 'react';

import { useSettings, useUpdateSettings } from '@/entities/user/api/use-settings';
import { useNetworkStatus } from '@/shared/lib/network/useNetworkStatus';
import type { ThemePreference } from '@/shared/lib/theme/theme';
import { setThemePreference, useThemePreference } from '@/shared/lib/theme/useTheme';
import { Skeleton } from '@/shared/ui/Skeleton';

import { ErrorText, SettingsShell, StatusText } from '../ui/SettingsShell';

const THEME_OPTIONS: { value: ThemePreference; label: string; hint: string }[] = [
  { value: 'light', label: 'Светлая', hint: 'Светлое оформление' },
  { value: 'dark', label: 'Тёмная', hint: 'Тёмное оформление' },
  { value: 'system', label: 'Системная', hint: 'Как в настройках устройства' },
];

export function ThemeSettingsPage() {
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const { isOnline } = useNetworkStatus();
  const active = useThemePreference();
  const [saved, setSaved] = useState('');
  // A theme picked while offline: the server update mutation is online-only, so we
  // hold the choice and flush it once the network returns, keeping the "saves on
  // reconnect" promise instead of silently dropping the server copy.
  const pendingTheme = useRef<ThemePreference | null>(null);

  // Theme is applied instantly on selection (works offline); the server copy is
  // updated when online so it persists across devices, and queued locally otherwise.
  const selectTheme = (theme: ThemePreference) => {
    setThemePreference(theme);
    setSaved('');
    if (isOnline) {
      pendingTheme.current = null;
      updateSettings.mutate({ theme }, { onSuccess: () => setSaved('Тема сохранена') });
    } else {
      pendingTheme.current = theme;
    }
  };

  // Flush the offline choice to the server as soon as we are back online. Listen
  // to the raw 'online' event (not just the isOnline prop) so the flush fires
  // reliably on reconnect; pendingTheme guards it to exactly once per selection.
  // Keep the latest flush closure in a ref so the one-time 'online' listener
  // always calls the current updateSettings without re-subscribing each render.
  const flushRef = useRef<() => void>(() => {});
  useEffect(() => {
    flushRef.current = () => {
      if (pendingTheme.current) {
        const theme = pendingTheme.current;
        pendingTheme.current = null;
        updateSettings.mutate(
          { theme },
          {
            onSuccess: () => setSaved('Тема сохранена'),
            // Re-arm on a failed flush so the choice isn't lost until the next
            // manual selection: a later 'online' event (or reconnect) retries it.
            // Only re-arm if the user hasn't picked a newer theme meanwhile.
            onError: () => {
              // Clear the success line too: a failed flush must not leave
              // «Тема сохранена» standing next to the error alert.
              setSaved('');
              if (pendingTheme.current === null) pendingTheme.current = theme;
            },
          },
        );
      }
    };
  });
  useEffect(() => {
    const handler = () => flushRef.current();
    window.addEventListener('online', handler);
    return () => window.removeEventListener('online', handler);
  }, []);

  return (
    <SettingsShell title="Оформление">
      {!settings ? (
        <Skeleton variant="form" count={2} />
      ) : (
      <>
      <h2 className="text-h2 px-[10px] text-content">Выберите тему оформления:</h2>
      <div className="flex flex-col gap-[15px]">
        {THEME_OPTIONS.map((option) => {
          const isActive = active === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={isActive}
              onClick={() => selectTheme(option.value)}
              // Выбранная подсвечена ролью «успех» (в макете обводка #1A6B32)
              // и галочкой того же цвета справа.
              className={`flex items-center justify-between gap-[10px] rounded-[14px] border p-[10px] text-left transition-colors ${
                isActive ? 'border-success' : 'border-line'
              }`}
            >
              <span className="flex flex-1 flex-col gap-[5px] px-[10px]">
                <span className="text-h3 text-content">{option.label}</span>
                <span className="text-caption text-muted">{option.hint}</span>
              </span>
              {isActive ? (
                <Icon icon={checkmarkCircle} className="text-success" aria-hidden="true" />
              ) : null}
            </button>
          );
        })}
        <ErrorText error={updateSettings.error} />
        <StatusText message={saved} />
        {!isOnline ? (
          <p className="text-body-s text-muted">
            Офлайн: тема применена локально, сохранится на сервере при подключении.
          </p>
        ) : null}
      </div>
      </>
      )}
    </SettingsShell>
  );
}
