import { afterEach, describe, expect, it, vi } from 'vitest';

const isNativeMock = vi.fn(() => false);
vi.mock('@/shared/config/env', () => ({
  env: {
    get isNative() {
      return isNativeMock();
    },
  },
}));

/** Ставит окружение браузера: iOS/не-iOS, установленная PWA или вкладка. */
function stubBrowser({
  ios = false,
  standalone = false,
  pushManager = true,
  notification = 'default' as string | null,
}) {
  vi.stubGlobal('navigator', {
    userAgent: ios
      ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
      : 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120',
    maxTouchPoints: ios ? 5 : 0,
    ...(ios && standalone ? { standalone: true } : {}),
  });
  vi.stubGlobal('window', {
    ...(pushManager ? { PushManager: function () {} } : {}),
    navigator: globalThis.navigator,
    matchMedia: (query: string) => ({ matches: standalone && query.includes('standalone') }),
  });
  if (notification === null) vi.stubGlobal('Notification', undefined);
  else vi.stubGlobal('Notification', { permission: notification });
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('pushPermission', () => {
  it('в обычном браузере возвращает состояние Notification.permission', async () => {
    isNativeMock.mockReturnValue(false);
    stubBrowser({ notification: 'granted' });
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'QmFzZTY0VXJsVmFwaWRLZXk');
    const { pushPermission } = await import('./permission');
    expect(pushPermission()).toBe('granted');
  });

  it('без VAPID-ключа считает push неподдержанным — registerWeb там всё равно выйдет сразу', async () => {
    isNativeMock.mockReturnValue(false);
    stubBrowser({});
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', '');
    const { pushPermission } = await import('./permission');
    expect(pushPermission()).toBe('unsupported');
  });

  it('iOS во вкладке Safari → отдельное состояние, а не "не поддерживается"', async () => {
    // Главный случай из жалобы «пуш не приходит»: на iPhone web-push работает
    // только у PWA с домашнего экрана, и кнопка «Включить» тут бесполезна —
    // экран должен объяснить, что приложение нужно установить.
    isNativeMock.mockReturnValue(false);
    stubBrowser({ ios: true, standalone: false, pushManager: false });
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'QmFzZTY0VXJsVmFwaWRLZXk');
    const { pushPermission } = await import('./permission');
    expect(pushPermission()).toBe('unavailable-ios-browser');
  });

  it('iOS как установленная PWA → обычный запрос разрешения', async () => {
    isNativeMock.mockReturnValue(false);
    stubBrowser({ ios: true, standalone: true, notification: 'default' });
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'QmFzZTY0VXJsVmFwaWRLZXk');
    const { pushPermission } = await import('./permission');
    expect(pushPermission()).toBe('default');
  });

  it('в нативной сборке разрешение читает Capacitor → всегда default', async () => {
    isNativeMock.mockReturnValue(true);
    stubBrowser({});
    const { pushPermission } = await import('./permission');
    expect(pushPermission()).toBe('default');
  });
});

describe('isStandalone', () => {
  it('распознаёт и iOS-флаг navigator.standalone, и display-mode', async () => {
    isNativeMock.mockReturnValue(false);
    stubBrowser({ ios: true, standalone: true });
    const ios = await import('./permission');
    expect(ios.isStandalone()).toBe(true);
    vi.resetModules();

    stubBrowser({ ios: false, standalone: true });
    const other = await import('./permission');
    expect(other.isStandalone()).toBe(true);
    vi.resetModules();

    stubBrowser({ ios: false, standalone: false });
    const tab = await import('./permission');
    expect(tab.isStandalone()).toBe(false);
  });
});
