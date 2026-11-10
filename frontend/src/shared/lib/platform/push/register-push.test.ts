import { afterEach, describe, expect, it, vi } from 'vitest';

const isNativeMock = vi.fn(() => true);
const platformMock = vi.fn(() => 'ios');
vi.mock('@/shared/config/env', () => ({ env: { get isNative() { return isNativeMock(); } } }));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => platformMock() } }));

describe('registerPush', () => {
  afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it('native ios: register → registration listener → token, keys=null', async () => {
    isNativeMock.mockReturnValue(true);
    platformMock.mockReturnValue('ios');
    const { PushNotifications } = await import('@capacitor/push-notifications');
    (PushNotifications.addListener as ReturnType<typeof vi.fn>).mockImplementation(
      async (event: string, cb: (d: { value: string }) => void) => {
        if (event === 'registration') cb({ value: 'apns-token-123' });
        return { remove: vi.fn() };
      },
    );
    const { registerPush } = await import('./register-push');
    const result = await registerPush();
    expect(PushNotifications.register).toHaveBeenCalled();
    expect(result).toEqual({ platform: 'ios', token: 'apns-token-123', keys: null });
  });

  it('native: permission denied → null', async () => {
    isNativeMock.mockReturnValue(true);
    const { PushNotifications } = await import('@capacitor/push-notifications');
    (PushNotifications.checkPermissions as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      receive: 'denied',
    });
    const { registerPush } = await import('./register-push');
    expect(await registerPush()).toBeNull();
    expect(PushNotifications.requestPermissions).not.toHaveBeenCalled();
  });

  it('native: requests permission only from the explicit enable action', async () => {
    isNativeMock.mockReturnValue(true);
    const { PushNotifications } = await import('@capacitor/push-notifications');
    (PushNotifications.checkPermissions as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      receive: 'prompt',
    });
    (PushNotifications.requestPermissions as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      receive: 'denied',
    });
    const { registerPush } = await import('./register-push');
    expect(await registerPush(true)).toBeNull();
    expect(PushNotifications.requestPermissions).toHaveBeenCalledTimes(1);
  });

  it('web: PushManager.subscribe → {platform:web, endpoint, keys}', async () => {
    isNativeMock.mockReturnValue(false);
    const requestPermission = vi.fn(async () => 'granted');
    vi.stubGlobal('Notification', { permission: 'granted', requestPermission });
    const sub = {
      endpoint: 'https://push.example/abc',
      getKey: (name: string) =>
        name === 'p256dh' ? new TextEncoder().encode('PKEY') : new TextEncoder().encode('AUTH'),
    };
    const reg = { pushManager: { subscribe: vi.fn(async () => sub) } };
    vi.stubGlobal('navigator', {
      serviceWorker: { ready: Promise.resolve(reg), register: vi.fn() },
    });
    vi.stubGlobal('window', { PushManager: function () {} });
    vi.stubGlobal('PushManager', function () {});
    // Валидный base64url-ключ (атоб должен распарсить — как реальный VAPID-ключ браузера).
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'QmFzZTY0VXJsVmFwaWRLZXk');
    const { registerPush } = await import('./register-push');
    const result = await registerPush();
    expect(result?.platform).toBe('web');
    expect(result?.token).toBe('https://push.example/abc');
    expect(result?.keys).toEqual({ p256dh: expect.any(String), auth: expect.any(String) });
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('web: default permission stays untouched during background registration', async () => {
    isNativeMock.mockReturnValue(false);
    const requestPermission = vi.fn(async () => 'granted');
    const subscribe = vi.fn();
    vi.stubGlobal('Notification', { permission: 'default', requestPermission });
    vi.stubGlobal('navigator', { serviceWorker: { ready: Promise.resolve({ pushManager: { subscribe } }) } });
    vi.stubGlobal('window', { PushManager: function () {} });
    vi.stubGlobal('PushManager', function () {});
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'QmFzZTY0VXJsVmFwaWRLZXk');
    const { registerPush } = await import('./register-push');
    expect(await registerPush()).toBeNull();
    expect(requestPermission).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('web: explicit enable asks once and subscribes after permission is granted', async () => {
    isNativeMock.mockReturnValue(false);
    const requestPermission = vi.fn(async () => 'granted');
    const subscribe = vi.fn(async () => ({
      endpoint: 'https://push.example/explicit',
      getKey: () => new Uint8Array([1, 2, 3]).buffer,
    }));
    vi.stubGlobal('Notification', { permission: 'default', requestPermission });
    vi.stubGlobal('navigator', { serviceWorker: { ready: Promise.resolve({ pushManager: { subscribe } }) } });
    vi.stubGlobal('window', { PushManager: function () {} });
    vi.stubGlobal('PushManager', function () {});
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'QmFzZTY0VXJsVmFwaWRLZXk');
    const { registerPush } = await import('./register-push');
    expect((await registerPush(true))?.token).toBe('https://push.example/explicit');
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it('web: нет PushManager (iOS Safari вне PWA) → null', async () => {
    isNativeMock.mockReturnValue(false);
    vi.stubGlobal('window', {});
    vi.stubGlobal('navigator', {});
    const { registerPush } = await import('./register-push');
    expect(await registerPush()).toBeNull();
  });
});
