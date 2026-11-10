/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_API_MOCK?: string;
  readonly VITE_TARGET?: 'pwa' | 'native';
  /** Публичный ключ VAPID. Пустой/отсутствует — web-push выключен. */
  readonly VITE_VAPID_PUBLIC_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Версия из frontend/package.json, подставляемая на сборке через `define`. */
declare const __APP_VERSION__: string;
declare const __APP_BUILD_ID__: string;
