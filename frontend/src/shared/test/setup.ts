import { onlineManager } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';

import { clear as idbClear } from 'idb-keyval';
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest';

import { resetMockStores } from '@/app/mocks/handlers';
import { server } from '@/app/mocks/server';
import { setupZodRu } from '@/shared/lib/validation/zod-ru';

// Match production: install the Russian zod error map for all tests.
setupZodRu();

// Нативные Capacitor-плагины недоступны в jsdom — заменяем in-memory реализациями.
vi.mock('@capacitor/preferences', () => {
  const store = new Map<string, string>();
  return {
    Preferences: {
      get: vi.fn(async ({ key }: { key: string }) => ({ value: store.get(key) ?? null })),
      set: vi.fn(async ({ key, value }: { key: string; value: string }) => {
        store.set(key, value);
      }),
      remove: vi.fn(async ({ key }: { key: string }) => {
        store.delete(key);
      }),
    },
  };
});

// Реальный API @aparajita/capacitor-secure-storage:
//   get(key, convertDate?, sync?)  => Promise<DataType | null>
//   set(key, data, convertDate?, sync?, access?) => Promise<void>
//   remove(key, sync?)             => Promise<boolean>  (true, если ключ существовал)
//   clear(sync?)                   => Promise<void>
// Экспортируется как `SecureStorage` (proxy). Мок хранит значения как есть.
vi.mock('@aparajita/capacitor-secure-storage', () => {
  const store = new Map<string, unknown>();
  return {
    SecureStorage: {
      get: vi.fn(async (key: string) => (store.has(key) ? store.get(key) : null)),
      set: vi.fn(async (key: string, data: unknown) => {
        store.set(key, data);
      }),
      remove: vi.fn(async (key: string) => store.delete(key)),
      clear: vi.fn(async () => {
        store.clear();
      }),
    },
  };
});

vi.mock('@capacitor/splash-screen', () => ({
  SplashScreen: { hide: vi.fn(async () => {}), show: vi.fn(async () => {}) },
}));

vi.mock('@capacitor/status-bar', () => ({
  StatusBar: {
    setStyle: vi.fn(async () => {}),
    setBackgroundColor: vi.fn(async () => {}),
    setOverlaysWebView: vi.fn(async () => {}),
  },
  Style: { Dark: 'DARK', Light: 'LIGHT', Default: 'DEFAULT' },
}));

vi.mock('@capgo/capacitor-navigation-bar', () => ({
  NavigationBar: {
    setNavigationBarColor: vi.fn(async () => {}),
    getNavigationBarColor: vi.fn(async () => ({ color: '#000000', darkButtons: false })),
    show: vi.fn(async () => {}),
    hide: vi.fn(async () => {}),
  },
  NavigationBarColor: { WHITE: '#FFFFFF', BLACK: '#000000', TRANSPARENT: 'transparent' },
}));

vi.mock('@capacitor/keyboard', () => ({
  Keyboard: {
    setResizeMode: vi.fn(async () => {}),
    setAccessoryBarVisible: vi.fn(async () => {}),
  },
  KeyboardResize: { Native: 'native', Body: 'body', Ionic: 'ionic', None: 'none' },
}));

vi.mock('@capacitor/camera', () => ({
  Camera: {
    takePhoto: vi.fn(async () => ({ webPath: 'blob:mock-photo' })),
    chooseFromGallery: vi.fn(async () => ({ results: [{ webPath: 'blob:mock-photo' }] })),
    checkPermissions: vi.fn(async () => ({ camera: 'granted', photos: 'granted' })),
    requestPermissions: vi.fn(async () => ({ camera: 'granted', photos: 'granted' })),
  },
}));

vi.mock('@capacitor/action-sheet', () => ({
  ActionSheet: { showActions: vi.fn(async () => ({ index: 0, canceled: false })) },
  ActionSheetButtonStyle: { Default: 'DEFAULT', Destructive: 'DESTRUCTIVE', Cancel: 'CANCEL' },
}));

vi.mock('@capacitor/push-notifications', () => ({
  PushNotifications: {
    checkPermissions: vi.fn(async () => ({ receive: 'granted' })),
    requestPermissions: vi.fn(async () => ({ receive: 'granted' })),
    register: vi.fn(async () => {}),
    addListener: vi.fn(async () => ({ remove: vi.fn(async () => {}) })),
  },
}));

// Зеркалит поведение NetworkWeb (navigator.onLine), но без постоянных window
// online/offline listener'ов реального плагина — те пережили бы тест и стреляли
// бы на чужие dispatchEvent('online') из других файлов (checkHealth → fetch →
// MSW onUnhandledRequest: 'error'). useNetworkStatus.test.tsx перекрывает этот
// мок своим управляемым (захват callback + переключаемый connected).
vi.mock('@capacitor/network', () => ({
  Network: {
    getStatus: vi.fn(async () => ({
      connected: typeof navigator === 'undefined' || navigator.onLine,
      connectionType: 'wifi',
    })),
    addListener: vi.fn(async () => ({ remove: vi.fn(async () => {}) })),
  },
}));

vi.mock('@capgo/capacitor-autofill-save-password', () => ({
  SavePassword: { promptDialog: vi.fn(async () => {}) },
}));

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    checkPermissions: vi.fn(async () => ({ display: 'granted' })),
    requestPermissions: vi.fn(async () => ({ display: 'granted' })),
    schedule: vi.fn(async () => {}),
    cancel: vi.fn(async () => {}),
    getPending: vi.fn(async () => ({ notifications: [] })),
  },
}));

beforeEach(() => onlineManager.setOnline(true));
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(async () => {
  server.resetHandlers();
  resetMockStores();
  window.localStorage.clear();
  await idbClear();
});
afterAll(() => server.close());
