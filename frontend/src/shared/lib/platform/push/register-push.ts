import { Capacitor } from '@capacitor/core';

import type { components } from '@/shared/api/schema';
import { env } from '@/shared/config/env';

export type PushTokenRequest = components['schemas']['PushTokenRequest'];

/** Кодирует ключ подписки в base64url. Принимает ArrayBuffer (реальный браузер)
 * или ArrayBufferView/Uint8Array (тестовый стаб). */
function arrayBufferToBase64Url(buf: ArrayBuffer | ArrayBufferView | null): string {
  if (!buf) return '';
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf instanceof ArrayBuffer ? buf : buf.buffer);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) arr[i] = raw.charCodeAt(i);
  return arr;
}

async function registerNative(requestPermission: boolean): Promise<PushTokenRequest | null> {
  const { PushNotifications } = await import('@capacitor/push-notifications');
  const existing = await PushNotifications.checkPermissions();
  const perm =
    existing.receive !== 'granted' && requestPermission
      ? await PushNotifications.requestPermissions()
      : existing;
  if (perm.receive !== 'granted') return null;

  const platform = Capacitor.getPlatform() as 'ios' | 'android';
  // На устройстве 'registration' приходит async, поэтому слушатели регистрируем ДО
  // register(). Хендлы снимаем в finally — иначе при повторной регистрации
  // (retry/ре-логин) слушатели копятся.
  let resolve!: (value: string | null) => void;
  const tokenPromise = new Promise<string | null>((r) => {
    resolve = r;
  });
  const handles = await Promise.all([
    PushNotifications.addListener('registration', (t) => resolve(t.value)),
    PushNotifications.addListener('registrationError', () => resolve(null)),
  ]);
  // If neither 'registration' nor 'registrationError' ever fires (silent APNs/FCM
  // failure), the await below would hang forever and leak the listeners. Cap the
  // wait: resolve(null) after 30s so the caller gets a clean "no token" and the
  // finally block removes the listeners.
  const timer = setTimeout(() => resolve(null), 30_000);
  void PushNotifications.register();
  try {
    const token = await tokenPromise;
    if (!token) return null;
    return { platform, token, keys: null };
  } finally {
    clearTimeout(timer);
    await Promise.all(handles.map((h) => h.remove()));
  }
}

async function registerWeb(requestPermission: boolean): Promise<PushTokenRequest | null> {
  if (typeof window === 'undefined' || !('PushManager' in window)) return null;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  const vapid = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!vapid) return null;

  const permission =
    Notification.permission === 'default' && requestPermission
      ? await Notification.requestPermission()
      : Notification.permission;
  if (permission !== 'granted') return null;

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapid),
  });
  return {
    platform: 'web',
    token: sub.endpoint,
    keys: {
      p256dh: arrayBufferToBase64Url(sub.getKey('p256dh')),
      auth: arrayBufferToBase64Url(sub.getKey('auth')),
    },
  };
}

/** Background renewal only reads permission. A prompt is allowed solely from the settings button. */
export function registerPush(requestPermission = false): Promise<PushTokenRequest | null> {
  return env.isNative ? registerNative(requestPermission) : registerWeb(requestPermission);
}
