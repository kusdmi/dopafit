import { Icon } from '@/shared/ui/primitives';
import { cloudOfflineOutline } from '@/shared/ui/icons';
import { useState } from 'react';

import { useSessionStore } from '@/entities/session/model/store';
import { useNetworkStatus } from '@/shared/lib/network/useNetworkStatus';

/**
 * Небольшая иконка-кнопка в верхнем углу экрана вместо широкого офлайн-баннера
 * Показывается только для авторизованного пользователя (гостевые экраны
 * сами дизейблят действия с меткой «офлайн»). По тапу — маленький поповер с
 * пояснением, что приложение работает офлайн и данные синхронизируются при
 * подключении.
 *
 * Живёт на уровне AppFrame (вне router outlet, чтобы `contain: layout` страниц
 * не обрезал fixed-элемент). Учитывает safe-area iOS и сидит НИЖЕ шапки, иначе
 * занимал бы ту же зону, что end-slot кнопки первого тулбара (колокольчик
 * уведомлений на Главной, таймер на WorkoutPage/ExerciseDetailPage), и
 * перехватывал бы по ним тапы. Смещение — на высоту хедера через глобальную
 * --header-space (safe-area + тулбар), без магии инлайном.
 */
export function OfflineIndicator() {
  const { isOffline } = useNetworkStatus();
  const isAuthenticated = useSessionStore((s) => s.isAuthenticated);
  const show = isOffline && isAuthenticated;

  // Когда снова онлайн — размонтируем кнопку целиком, поэтому её локальное
  // состояние `open` сбрасывается само и поповер не «зависает» (никакого
  // setState-в-эффекте не нужно).
  if (!show) return null;
  return <OfflineButton />;
}

function OfflineButton() {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="fixed right-2 z-[60] flex flex-col items-end animate-fade-in"
      style={{ top: 'calc(var(--header-space) + 0.5rem)' }}
    >
      <button
        type="button"
        aria-label="Офлайн-режим"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        // Кружок из макета — 36px, а тап-цель должна быть ≥44px: растим
        // область отрицательным внешним отступом (приём IconChip), сам круг
        // остаётся нарисован тем же размером.
        className="-m-1 flex min-h-[44px] min-w-[44px] items-center justify-center p-1 text-brand-text"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-card-light shadow-raised">
          <Icon icon={cloudOfflineOutline} aria-hidden="true" style={{ fontSize: 20 }} />
        </span>
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Офлайн-режим"
          className="mt-2 max-w-[16rem] rounded-card border border-line bg-card p-3 text-body-m text-content shadow-overlay animate-fade-in"
        >
          <p className="text-h3">Офлайн-режим</p>
          <p className="mt-1 text-muted">
            Приложение работает без сети. Изменения сохраняются на устройстве и
            синхронизируются автоматически при подключении.
          </p>
        </div>
      )}
    </div>
  );
}
