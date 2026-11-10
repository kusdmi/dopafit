import { afterEach, expect, it, vi } from 'vitest';

const hide = vi.fn(async () => {});
vi.mock('@capacitor/splash-screen', () => ({ SplashScreen: { hide } }));

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

it('hideSplash is a no-op on web', async () => {
  vi.doMock('@/shared/config/env', () => ({ env: { isNative: false } }));
  const { hideSplash } = await import('./splash');
  await hideSplash();
  expect(hide).not.toHaveBeenCalled();
});

it('hideSplash calls SplashScreen.hide on native', async () => {
  vi.doMock('@/shared/config/env', () => ({ env: { isNative: true } }));
  const { hideSplash } = await import('./splash');
  await hideSplash();
  expect(hide).toHaveBeenCalledTimes(1);
});
