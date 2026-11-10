import { Toggle } from '@/shared/ui/primitives';

import {
  useNotificationSettings,
  useUpdateNotificationSettings,
  type NotificationSettings,
} from '@/entities/notification/api/use-notification-settings';
import { useEnablePush } from '@/entities/notification/api/use-enable-push';
import { Button } from '@/shared/ui/Button';
import { Skeleton } from '@/shared/ui/Skeleton';

import { SettingsShell } from '../ui/SettingsShell';

const NOTIFICATION_CATEGORIES: {
  field: Exclude<keyof NotificationSettings, 'push_enabled'>;
  title: string;
  desc: string;
}[] = [
  {
    field: 'workout_reminders',
    title: 'Напоминания о тренировках',
    desc: 'Подскажем, когда пора на запланированную тренировку',
  },
  {
    field: 'measurement_reminders',
    title: 'Напоминания о замерах',
    desc: 'Не забудьте отметить вес и антропометрию',
  },
  {
    field: 'progress_updates',
    title: 'Обновления прогресса',
    desc: 'Новые рекорды и заметные изменения в результатах',
  },
  {
    field: 'weekly_reports',
    title: 'Еженедельные отчёты',
    desc: 'Сводка тренировок и прогресса за неделю',
  },
  {
    field: 'motivational',
    title: 'Мотивационные сообщения',
    desc: 'Поддержка и советы, чтобы не сбавлять темп',
  },
  {
    field: 'new_features',
    title: 'Новые возможности',
    desc: 'Рассказываем о новых функциях приложения',
  },
];

/**
 * Состояние разрешения браузера, отдельно от серверной настройки `push_enabled`.
 *
 * Это два разных выключателя, и раньше экран показывал только второй: тумблер
 * говорил «уведомления включены», пока браузер вообще не спрашивал разрешения —
 * и пуши, естественно, не приходили. Разрешение нельзя запросить в фоне (Safari
 * на iOS принимает запрос только внутри обработчика жеста), поэтому здесь стоит
 * явная кнопка.
 */
function PushPermissionNotice() {
  const { permission, pending, failed, enable } = useEnablePush();

  if (permission === 'granted') return null;

  if (permission === 'unavailable-ios-browser')
    return (
      <div className="rounded-[14px] border border-line p-[10px] text-body-s text-muted">
        На iPhone и iPad уведомления приходят только установленному приложению. Нажмите
        «Поделиться» в Safari, выберите «На экран „Домой“», откройте DopaFit с домашнего
        экрана и вернитесь сюда.
      </div>
    );

  if (permission === 'unsupported')
    return (
      <div className="rounded-[14px] border border-line p-[10px] text-body-s text-muted">
        Этот браузер не поддерживает пуш-уведомления. Уведомления по-прежнему видны на
        экране «Уведомления» внутри приложения.
      </div>
    );

  if (permission === 'denied')
    return (
      <div className="rounded-[14px] border border-line p-[10px] text-body-s text-muted">
        Уведомления заблокированы в настройках браузера. Разрешить их обратно можно только
        там: откройте настройки сайта и включите «Уведомления».
      </div>
    );

  return (
    <div className="flex flex-col gap-[10px] rounded-[14px] border border-brand-400 p-[10px]">
      <p className="text-body-s text-muted">
        Браузер ещё не спрашивал разрешение на уведомления — без него пуши не приходят,
        даже когда тумблеры ниже включены.
      </p>
      {failed && (
        <p className="text-caption text-muted">
          Не удалось включить. Попробуйте ещё раз или проверьте настройки браузера.
        </p>
      )}
      <Button loading={pending} onClick={() => void enable()}>
        Включить уведомления
      </Button>
    </div>
  );
}

export function NotificationSettingsPage() {
  const { data: settings, isLoading } = useNotificationSettings();
  const update = useUpdateNotificationSettings();

  return (
    <SettingsShell title="Пуш-уведомления">
      {isLoading || !settings ? (
        <Skeleton variant="form" count={2} />
      ) : (
        <>
          <PushPermissionNotice />
          <div className="flex min-h-[64px] items-center gap-[10px] rounded-[14px] border border-brand-400 p-[10px]">
            <div className="flex flex-1 flex-col gap-[5px]">
              <p className="text-h3 text-content">Все уведомления</p>
              <p className="text-caption text-muted">
                {settings.push_enabled ? 'Уведомления включены' : 'Уведомления отключены'}
              </p>
            </div>
            <Toggle
              aria-label="Все уведомления"
              checked={settings.push_enabled}
              onChange={(e) => update.mutate({ push_enabled: e.target.checked })}
            />
          </div>

          {settings.push_enabled ? (
            <section className="flex flex-col gap-[15px]">
              <h2 className="text-caption px-[10px] text-muted">Типы уведомлений</h2>
              <ul className="flex flex-col gap-[15px]">
                {NOTIFICATION_CATEGORIES.map(({ field, title, desc }) => (
                  <li
                    key={field}
                    // Одинаковая минимальная высота у всех строк: подписи бывают
                    // в одну и в две строки, и без неё карточки в списке
                    // прыгали по высоте.
                    className="flex min-h-[64px] items-center gap-[10px] rounded-[14px] border border-line p-[10px]"
                  >
                    <div className="flex flex-1 flex-col gap-[5px]">
                      <p className="text-h3 text-content">{title}</p>
                      <p className="text-caption text-muted">{desc}</p>
                    </div>
                    <Toggle
                      aria-label={title}
                      checked={settings[field]}
                      onChange={(e) => update.mutate({ [field]: e.target.checked })}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <div className="rounded-[14px] border border-line p-[10px] text-body-s text-muted">
              Включите уведомления, чтобы не пропустить важные напоминания о тренировках и замерах
            </div>
          )}
        </>
      )}
    </SettingsShell>
  );
}
