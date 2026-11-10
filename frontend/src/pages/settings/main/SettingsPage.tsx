import { Icon } from '@/shared/ui/primitives';
import {
  chevronForward,
  colorPaletteOutline,
  diamondOutline,
  giftOutline,
  helpBuoyOutline,
  logOutOutline,
  notificationsOutline,
  peopleOutline,
  personOutline,
  phonePortraitOutline,
  trashOutline,
} from '@/shared/ui/icons';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { useSessionStore } from '@/entities/session/model/store';
import { signOutAndExit } from '@/entities/session/model/teardown';
import { useMe } from '@/entities/user/api/use-me';
import { paths } from '@/shared/config/paths';
import { usePwaInstall } from '@/shared/lib/platform/pwa/install';
import { getAppVersion } from '@/shared/lib/platform/app-info/app-version';
import { Button } from '@/shared/ui/Button';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';

import { SettingsShell } from '../ui/SettingsShell';

export function SettingsPage() {
  const { data: me } = useMe();
  const install = usePwaInstall();
  const role = useSessionStore((s) => s.user?.role);
  const queryClient = useQueryClient();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [appVersion, setAppVersion] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getAppVersion().then((version) => {
      if (!cancelled) setAppVersion(version);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = () => {
    setConfirmLogout(false);
    void signOutAndExit(queryClient);
  };

  const links = [
    [role === 'trainer' ? 'Мои клиенты' : 'Мой тренер', paths.connections, peopleOutline],
    ['Премиум', paths.settingsSubscription, diamondOutline],
    ['Пуш-уведомления', paths.settingsNotifications, notificationsOutline],
    ['Реферальная программа', paths.settingsReferral, giftOutline],
    ['Личные данные', paths.settingsProfile, personOutline],
    ['Оформление', paths.settingsTheme, colorPaletteOutline],
    ['Техподдержка', paths.support, helpBuoyOutline],
    ['Удаление аккаунта', paths.settingsDelete, trashOutline],
  ] as const;

  return (
    // Подзаголовок — из макета 1059:2004 / 1064:2038 (Body S под заголовком),
    // штатной второй строкой шапки, как на «Программах» и «Замерах».
    <SettingsShell title="Настройки" subtitle="Управление вашим аккаунтом" root>
      <Link
        to={paths.settingsProfile}
        aria-label="Открыть данные аккаунта"
        className="flex min-h-[60px] items-center justify-between gap-[10px] rounded-[14px] border border-line p-[10px] text-content"
      >
        <div className="flex min-w-0 flex-col gap-[5px]">
          <p className="text-h3 text-content">{me?.profile.full_name ?? 'Профиль'}</p>
          <p className="text-body-s text-muted">{me?.user.phone ?? me?.user.email}</p>
        </div>
        <Icon icon={chevronForward} className="shrink-0 text-muted" aria-hidden="true" />
      </Link>
      {!install.native && !install.standalone && (
        <Link
          to={paths.settingsInstall}
          className="flex min-h-[72px] items-center gap-3 rounded-[14px] border border-brand-400 p-[15px] text-content"
          aria-label="Установить DopaFit"
        >
          <Icon icon={phonePortraitOutline} className="shrink-0 text-[28px] text-brand-text" />
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-h3 text-brand-text">Установить DopaFit</span>
            <span className="text-body-s text-muted">
              На экран «Домой» · инструкция для iOS и Android
            </span>
          </span>
          <Icon icon={chevronForward} className="shrink-0 text-brand-text" />
        </Link>
      )}
      {/* Меню — один список, а не набор равнозначных объектов: одна обведённая
          группа, внутри которой пункты разделены линиями. Обводка отмечает
          список, разделитель — границу пункта; отдельные карточки на каждый
          пункт отняли бы у экрана иерархию. */}
      <nav className="overflow-hidden rounded-[14px] border border-line">
        {links.map(([label, to, icon]) => (
          <Link
            key={to}
            to={to}
            className="flex min-h-[50px] items-center gap-[10px] border-b border-line px-[15px] text-content last:border-b-0"
          >
            <Icon icon={icon} className="text-muted" aria-hidden="true" />
            <span className="text-h3 flex-1 text-content">{label}</span>
            <Icon icon={chevronForward} className="text-muted" aria-hidden="true" />
          </Link>
        ))}
      </nav>
      <Button
        variant="outline"
        color="danger"
        onClick={() => setConfirmLogout(true)}
        className="mt-2"
      >
        <Icon slot="start" icon={logOutOutline} aria-hidden="true" />
        Выйти
      </Button>
      {appVersion && (
        <p className="text-center text-body-s text-muted">Dopafit версия {appVersion}</p>
      )}
      <ConfirmDialog
        isOpen={confirmLogout}
        title="Выйти из аккаунта?"
        message="Вы вернётесь на экран входа."
        confirmLabel="Выйти"
        cancelLabel="Отмена"
        destructive
        onConfirm={handleLogout}
        onCancel={() => setConfirmLogout(false)}
      />
    </SettingsShell>
  );
}
