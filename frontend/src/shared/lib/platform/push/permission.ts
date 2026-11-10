import { env } from '@/shared/config/env';

/**
 * Состояние разрешения на уведомления с точки зрения UI.
 *
 * - `unsupported` — окружение вообще не умеет web-push (или не задан VAPID-ключ);
 * - `unavailable-ios-browser` — iOS Safari во вкладке: пуши там недоступны в принципе,
 *   пока приложение не добавлено на домашний экран (см. `isIosBrowserTab`);
 * - `default` — разрешение ещё не спрашивали, кнопка «Включить» имеет смысл;
 * - `granted` / `denied` — пользователь уже ответил. `denied` необратимо из кода:
 *   повторный `requestPermission()` немедленно возвращает `denied`, менять это
 *   можно только в настройках браузера/системы.
 */
export type PushPermission =
  | 'unsupported'
  | 'unavailable-ios-browser'
  | 'default'
  | 'granted'
  | 'denied';

/** Приложение открыто как установленная PWA (домашний экран), а не как вкладка. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  // `standalone` — нестандартное свойство Safari на iOS; в остальных браузерах
  // отвечает display-mode.
  const iosStandalone = (window.navigator as { standalone?: boolean } | undefined)?.standalone;
  if (iosStandalone) return true;
  return window.matchMedia?.('(display-mode: standalone)').matches ?? false;
}

/** iOS/iPadOS по user-agent. Отдельно от `env.isNative`: речь про web-сборку в Safari. */
export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent ?? '';
  // iPadOS 13+ представляется Macintosh, отличаем по наличию тач-поинтов.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1);
}

/**
 * iOS вне установленной PWA. Web Push на iOS доступен только с 16.4+ и только для
 * приложения, добавленного на домашний экран: в обычной вкладке Safari `PushManager`
 * отсутствует, и никакая кнопка это не изменит — пользователю нужно «Поделиться →
 * На экран "Домой"». Выделено в отдельное состояние, чтобы экран настроек мог
 * объяснить это вместо бесполезного «не поддерживается».
 */
export function isIosBrowserTab(): boolean {
  return !env.isNative && isIos() && !isStandalone();
}

/** Текущее состояние разрешения — без запроса, только чтение. */
export function pushPermission(): PushPermission {
  if (env.isNative) {
    // В нативной сборке разрешение спрашивает Capacitor, и синхронно прочитать его
    // нельзя. UI показывает кнопку: повторный запрос безопасен, система сама решит,
    // показывать диалог или вернуть прежний ответ.
    return 'default';
  }
  if (isIosBrowserTab()) return 'unavailable-ios-browser';
  if (typeof window === 'undefined' || !('PushManager' in window)) return 'unsupported';
  if (typeof Notification === 'undefined') return 'unsupported';
  if (!import.meta.env.VITE_VAPID_PUBLIC_KEY) return 'unsupported';
  return Notification.permission as PushPermission;
}
