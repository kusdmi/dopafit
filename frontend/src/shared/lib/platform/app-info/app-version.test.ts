import { afterEach, expect, it, vi } from 'vitest';

const getInfo = vi.fn(async () => ({ version: '2.4.1' }));
vi.mock('@capacitor/app', () => ({ App: { getInfo } }));

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

it('falls back to the bundled version on web', async () => {
  vi.doMock('@/shared/config/env', () => ({ env: { isNative: false } }));
  const { getAppVersion } = await import('./app-version');
  expect(await getAppVersion()).toBe(__APP_VERSION__);
  expect(getInfo).not.toHaveBeenCalled();
});

it('reads the installed version from App.getInfo on native', async () => {
  vi.doMock('@/shared/config/env', () => ({ env: { isNative: true } }));
  const { getAppVersion } = await import('./app-version');
  expect(await getAppVersion()).toBe('2.4.1');
});

it('falls back to the bundled version when the native plugin throws', async () => {
  vi.doMock('@/shared/config/env', () => ({ env: { isNative: true } }));
  getInfo.mockRejectedValueOnce(new Error('not implemented'));
  const { getAppVersion } = await import('./app-version');
  expect(await getAppVersion()).toBe(__APP_VERSION__);
});
