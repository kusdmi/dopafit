import { useEffect, useRef } from 'react';

import { useNavigation } from '@/shared/lib/navigation';

/** Query-параметр, которым service worker передаёт метку при холодном старте. */
export const NOTIFICATION_ID_PARAM = 'notification_id';

/** Сообщение, которое шлёт service worker при тапе по системному уведомлению. */
interface NotificationClickMessage {
  type: 'notification-click';
  url: string;
  notificationId?: string | null;
}

function isNotificationClick(data: unknown): data is NotificationClickMessage {
  if (typeof data !== 'object' || data === null) return false;
  const message = data as Partial<NotificationClickMessage>;
  // Только относительный путь: service worker его уже проверил, но сообщение
  // приходит с другой стороны границы, и доверять ему на слово не стоит.
  return message.type === 'notification-click' && typeof message.url === 'string'
    && message.url.startsWith('/');
}

/** Метка уведомления из текущего адреса, если приложение открыли с пуша «вхолодную». */
function idFromLocation(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(NOTIFICATION_ID_PARAM);
}

/**
 * Переводит приложение на экран, указанный в уведомлении, и гасит само уведомление.
 *
 * Когда окно PWA уже открыто, service worker его переиспользует (второе окно
 * пользователю не нужно) — но `focus()` вернул бы приложение туда, где его закрыли.
 * Маршрут поэтому приезжает отдельным сообщением, которое слушает этот хук.
 * Случай «окна не было» service worker закрывает сам, через `openWindow(url)`;
 * сообщения там нет вовсе, поэтому метку уведомления он дописывает в query —
 * её разбирает тот же хук при первом рендере.
 *
 * `onOpen` приходит снаружи (app-слой), а не импортируется: пометка прочитанным
 * живёт в `entities/notification`, а этот файл — в `shared`, который на entities
 * ссылаться не может (слои FSD).
 */
export function useNotificationNavigation(onOpen?: (id: string) => void): void {
  const navigation = useNavigation();
  // Колбэк живёт в ref, чтобы его пересоздание не переподписывало слушатель и,
  // главное, не прогоняло заново разбор холодного старта.
  const open = useRef(onOpen);
  useEffect(() => {
    open.current = onOpen;
  }, [onOpen]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    // Ссылка берётся здесь, а не в cleanup: подписка и отписка должны идти на один и
    // тот же объект, даже если navigator к моменту размонтирования уже подменили.
    const container = navigator.serviceWorker;
    const onMessage = (event: MessageEvent) => {
      if (!isNotificationClick(event.data)) return;
      const { notificationId } = event.data;
      if (typeof notificationId === 'string' && notificationId) open.current?.(notificationId);
      navigation.push(event.data.url);
    };
    container.addEventListener('message', onMessage);
    return () => container.removeEventListener('message', onMessage);
  }, [navigation]);

  useEffect(() => {
    const id = idFromLocation();
    if (!id) return;
    open.current?.(id);
    // Параметр снимается из адреса сразу: он одноразовый, и без этого он
    // пережил бы перезагрузку экрана и любую ссылку, скопированную отсюда.
    const url = new URL(window.location.href);
    url.searchParams.delete(NOTIFICATION_ID_PARAM);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, []);
}
