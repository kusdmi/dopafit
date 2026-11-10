import { useCallback } from 'react';

import { useMarkRead } from '../api/use-mark-read';

/**
 * Помечает уведомление прочитанным при переходе по нему.
 *
 * Возвращает функцию, а не выполняет переход сама: маршрут у двух входов разный
 * (карточка в списке идёт через history, системный пуш — через service worker),
 * а вот правило «открыл — значит прочитал» одно, и жить оно должно в одном месте.
 *
 * Пометка НЕ блокирует переход: `mutate` (а не `mutateAsync`) не возвращает
 * промис и не бросает — ошибка уходит в onError мутации, и сеть не может
 * помешать человеку попасть туда, куда он шёл. Оптимистичное обновление кэша и
 * офлайн-очередь уже настроены на MARK_NOTIFICATIONS_READ_KEY в
 * shared/lib/offline/setupOffline.ts, поэтому счётчик непрочитанных падает
 * сразу, а сам запрос доезжает после восстановления связи.
 */
export function useMarkNotificationRead(): (id: string, isRead?: boolean) => void {
  const markRead = useMarkRead();
  return useCallback(
    (id: string, isRead = false) => {
      // Уже прочитанное не трогаем: иначе каждый тап по старой карточке слал бы
      // запрос, который ничего не меняет.
      if (isRead) return;
      markRead.mutate({ notificationIds: [id] });
    },
    [markRead],
  );
}
