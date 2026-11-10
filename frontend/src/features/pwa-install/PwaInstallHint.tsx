import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSessionStore } from '@/entities/session/model/store';
import { useWorkoutStore } from '@/entities/workout/model/store';
import { paths } from '@/shared/config/paths';
import { useNetworkStatus } from '@/shared/lib/network/useNetworkStatus';
import {
  canPresentInstallReminder,
  installReminderDue,
  recordInstallReminder,
  usePwaInstall,
} from '@/shared/lib/platform/pwa/install';
import { Icon } from '@/shared/ui/primitives';
import { closeOutline } from '@/shared/ui/icons';

export function PwaInstallHint() {
  const { pathname, key } = useLocation();
  const authenticated = useSessionStore((state) => state.isAuthenticated);
  const activeWorkout = useWorkoutStore((state) => Object.keys(state.sessions).length > 0);
  const { isOnline } = useNetworkStatus();
  const { platform, native, standalone, installed } = usePwaInstall();
  const [visibleKey, setVisibleKey] = useState<string | null>(null);
  const eligible =
    authenticated &&
    pathname === paths.home &&
    !activeWorkout &&
    isOnline &&
    !!platform &&
    !native &&
    !standalone &&
    !installed;
  useEffect(() => {
    if (!eligible || !installReminderDue()) return;
    const timer = setTimeout(() => {
      if (canPresentInstallReminder() && installReminderDue() && recordInstallReminder())
        setVisibleKey(key);
    }, 20_000);
    return () => clearTimeout(timer);
  }, [eligible, key]);
  if (!eligible || visibleKey !== key) return null;
  return (
    <aside
      aria-label="Установка DopaFit"
      aria-live="polite"
      className="fixed inset-x-4 z-40 mx-auto max-w-md rounded-[20px] border border-line bg-card p-4 text-content"
      style={{ bottom: 'calc(var(--bottom-stack) + 12px)', boxShadow: 'var(--shadow-overlay)' }}
    >
      <div className="flex items-start gap-3">
        <Link
          to={paths.settingsInstall}
          onClick={() => {
            recordInstallReminder();
            setVisibleKey(null);
          }}
          className="flex min-h-[44px] flex-1 flex-col gap-1"
        >
          <span className="text-h3 text-brand-text">Установить DopaFit</span>
          <span className="text-body-s text-muted">
            Открывайте приложение с экрана «Домой». Посмотреть инструкцию
          </span>
        </Link>
        <button
          type="button"
          aria-label="Напомнить через неделю"
          onClick={() => {
            recordInstallReminder();
            setVisibleKey(null);
          }}
          className="flex size-[44px] shrink-0 items-center justify-center text-muted"
        >
          <Icon icon={closeOutline} className="text-[24px]" />
        </button>
      </div>
    </aside>
  );
}
