import { Icon } from '@/shared/ui/primitives';
import { alertCircleOutline, closeOutline } from '@/shared/ui/icons';
import { useState } from 'react';

import { useSessionStore } from '@/entities/session/model/store';
import {
  removeFailedMutation,
  type FailedMutation,
} from '@/shared/lib/offline/failed-mutations';
import {
  useFailedMutations,
  useRetryFailedMutation,
} from '@/shared/lib/offline/use-failed-mutations';
import { useNetworkStatus } from '@/shared/lib/network/useNetworkStatus';

/**
 * Top-corner indicator for the "failed outbox": offline mutations that
 * exhausted their retries on replay and would otherwise be dropped silently. Shows
 * a count badge and a panel that lets the user retry each stranded action.
 *
 * Placed at AppFrame level (outside the router outlet, like OfflineIndicator) so
 * page `contain: layout` does not clip the fixed element. It sits BELOW the header
 * and BELOW the offline button (which owns top = header-space + 0.5rem) so the two
 * corner indicators never overlap or steal each other's taps.
 */
export function FailedSyncIndicator() {
  const isAuthenticated = useSessionStore((s) => s.isAuthenticated);
  const failed = useFailedMutations();
  if (!isAuthenticated || failed.length === 0) return null;
  // Pass the loaded list down: a second useFailedMutations() in the button would
  // re-load asynchronously and race with the network-status re-render, so the
  // panel could paint before its own copy resolved. One source of truth instead.
  return <FailedSyncButton failed={failed} />;
}

function FailedSyncButton({ failed }: { failed: FailedMutation[] }) {
  const [open, setOpen] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const retry = useRetryFailedMutation();
  const { isOffline } = useNetworkStatus();

  const handleRetry = async (id: string) => {
    const item = failed.find((f) => f.id === id);
    if (!item) return;
    setRetryingId(id);
    try {
      await retry(item);
    } finally {
      setRetryingId(null);
    }
  };

  const handleRemove = (id: string) => {
    void removeFailedMutation(id);
  };

  return (
    <div
      // z-[61] keeps this button (and its panel) ABOVE the OfflineIndicator's
      // popover (z-[60]): both live at AppFrame level and share `right-2`, and the
      // offline popover opens downward from just under the header — right over this
      // button's slot. The higher layer keeps the retry button tappable and its
      // own panel on top when both are open.
      className="fixed right-2 z-[61] flex flex-col items-end animate-fade-in"
      style={{ top: 'calc(var(--header-space) + 3.5rem)' }}
    >
      <button
        type="button"
        aria-label="Не синхронизировано"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        // Тап-цель ≥44px при нарисованном круге 36px — приём IconChip.
        className="-m-1 flex min-h-[44px] min-w-[44px] items-center justify-center p-1 text-danger-on-card-light"
      >
        <span className="relative flex h-9 w-9 items-center justify-center rounded-full border border-line bg-card-light shadow-raised">
        <Icon icon={alertCircleOutline} aria-hidden="true" style={{ fontSize: 20 }} />
        {/* Заливка — ступень 600, а не обычная для бейджей 400: подпись здесь
            роли Tag (11px SemiBold), то есть «мелкий текст» по WCAG с порогом
            4.5:1, а на danger-400 (#E53535) не проходит ни один доступный цвет
            текста — neutral-50 даёт 4.11:1, чистый белый 4.29:1, тёмный 4.28:1.
            Дело в самой заливке, поэтому взята более тёмная ступень danger-600
            (#A82020): neutral-50 на ней — 6.95:1. Другие danger-бейджи
            остаются на 400 — там текст крупнее. */}
          <span className="text-tag absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-600 px-1 text-neutral-50">
            {failed.length}
          </span>
        </span>
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Не синхронизировано"
          className="mt-2 max-w-[18rem] rounded-card border border-line bg-card p-3 text-body-m text-content shadow-overlay animate-fade-in"
        >
          <p className="text-h3">Не синхронизировано</p>
          <p className="mt-1 text-muted">
            Эти данные не удалось отправить на сервер. Повторите при стабильной сети.
          </p>
          {isOffline && (
            <p className="text-label mt-1 text-muted">Нет сети — повтор доступен онлайн.</p>
          )}
          <ul className="mt-2 space-y-2">
            {failed.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate text-content">{item.label}</span>
                {/* «Повторить» и «Удалить» стоят рядом, а нарисованы мелко
                    (~26 и 28px против нормы 44px). Промах здесь стоит дорого:
                    мимо повтора палец попадал по удалению, то есть вместо
                    второй попытки отправки запись терялась. Растим ОБЛАСТЬ
                    НАЖАТИЯ приёмом IconChip — отрицательный внешний отступ плюс
                    padding, — не меняя нарисованный размер. Зазор поднят с 4 до
                    12px, иначе расширенные области наложились бы друг на друга
                    и промах остался бы ровно там же. */}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void handleRetry(item.id)}
                    // Retry is meaningless offline: gate it like every other
                    // offline action in the app.
                    disabled={retryingId === item.id || isOffline}
                    className="text-label -my-2.5 flex min-h-[44px] items-center rounded-card border border-line px-2 py-2.5 text-brand-text disabled:opacity-50"
                  >
                    {retryingId === item.id ? 'Повтор…' : 'Повторить'}
                  </button>
                  <button
                    type="button"
                    aria-label={`Удалить: ${item.label}`}
                    onClick={() => handleRemove(item.id)}
                    disabled={retryingId === item.id}
                    className="-m-2 flex min-h-[44px] min-w-[44px] items-center justify-center p-2 text-muted disabled:opacity-50"
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-card border border-line">
                      <Icon icon={closeOutline} aria-hidden="true" style={{ fontSize: 16 }} />
                    </span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
