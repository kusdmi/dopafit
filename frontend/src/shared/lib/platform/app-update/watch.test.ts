import { afterEach, expect, it, vi } from 'vitest';
import { watchAppUpdates } from './watch';
import { createUpdateManager } from './manager';

vi.mock('./manager', () => ({ createUpdateManager: vi.fn() }));
vi.mock('./worker', () => ({
  BUILD_MESSAGE: 'DOPAFIT_GET_BUILD',
  CLEANUP_MESSAGE: 'DOPAFIT_CLEANUP_STATIC',
  registerReleaseWorker: async () => undefined,
}));

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

it('checks at startup, on returning to the tab and periodically without requiring standalone mode', () => {
  vi.useFakeTimers();
  const check = vi.fn(async () => {});
  const dispose = vi.fn();
  const apply = vi.fn(async () => {});
  vi.mocked(createUpdateManager).mockReturnValue({ check, dispose, apply });
  const watch = watchAppUpdates({
    currentBuild: 'release-current',
    blocked: async () => null,
    persist: async () => {},
    changed: () => {},
  });
  const automatic = vi.mocked(createUpdateManager).mock.calls[0][0].automatic;
  expect(check).toHaveBeenCalledTimes(1);
  expect(automatic()).toBe(true);
  document.dispatchEvent(new Event('input', { bubbles: true }));
  expect(automatic()).toBe(false);
  vi.advanceTimersByTime(30_000);
  window.dispatchEvent(new Event('focus'));
  expect(check).toHaveBeenCalledTimes(2);
  vi.advanceTimersByTime(30_000);
  document.dispatchEvent(new Event('visibilitychange'));
  expect(check).toHaveBeenCalledTimes(3);
  vi.advanceTimersByTime(30_000);
  window.dispatchEvent(new Event('online'));
  expect(check).toHaveBeenCalledTimes(4);
  vi.advanceTimersByTime(5 * 60_000);
  expect(check).toHaveBeenCalledTimes(5);
  watch.dispose();
  vi.advanceTimersByTime(5 * 60_000);
  window.dispatchEvent(new Event('focus'));
  expect(check).toHaveBeenCalledTimes(5);
  expect(dispose).toHaveBeenCalledOnce();
});
