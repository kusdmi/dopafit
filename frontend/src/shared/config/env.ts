import { Capacitor } from '@capacitor/core';

export const env = {
  apiUrl: Capacitor.isNativePlatform()
    ? (import.meta.env.VITE_API_URL as string | undefined) ?? ''
    : globalThis.location?.origin ?? 'http://localhost',
  apiMock: import.meta.env.VITE_API_MOCK === 'true',
  /** PWA-сборка включает service worker; native — нет. */
  target: (import.meta.env.VITE_TARGET as 'pwa' | 'native' | undefined) ?? 'pwa',
  /** Истинно внутри Capacitor WebView (iOS/Android). */
  isNative: Capacitor.isNativePlatform(),
} as const;
