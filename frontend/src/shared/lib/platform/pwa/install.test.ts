import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { platformStorage } from '@/shared/lib/platform/storage/settings';
import {
  INSTALL_PREFERENCE_KEY,
  INSTALL_REMINDER_INTERVAL,
  installReminderDue,
  recordInstallReminder,
  usePwaInstall,
  type InstallPromptEvent,
} from './install';
const mode = vi.hoisted(() => ({ native: false }));
vi.mock('@/shared/config/env', () => ({
  env: {
    get isNative() {
      return mode.native;
    },
  },
}));

beforeEach(() => {
  mode.native = false;
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
  platformStorage.remove(INSTALL_PREFERENCE_KEY);
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)',
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  platformStorage.remove(INSTALL_PREFERENCE_KEY);
});

it('remembers the reminder across reads and repeats only after seven days', () => {
  const now = Date.now();
  expect(installReminderDue(now)).toBe(true);
  expect(recordInstallReminder(now)).toBe(true);
  expect(installReminderDue(now + INSTALL_REMINDER_INTERVAL - 1)).toBe(false);
  expect(installReminderDue(now + INSTALL_REMINDER_INTERVAL)).toBe(true);
});
it('does not recommend installation in native, standalone, desktop or unavailable storage', () => {
  mode.native = true;
  expect(installReminderDue()).toBe(false);
  mode.native = false;
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
  expect(installReminderDue()).toBe(false);
  vi.mocked(window.matchMedia).mockReturnValue({ matches: false } as MediaQueryList);
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Desktop browser');
  expect(installReminderDue()).toBe(false);
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Android');
  vi.spyOn(platformStorage, 'get').mockImplementation(() => {
    throw new Error('blocked');
  });
  expect(installReminderDue()).toBe(false);
});
it('consumes the native install prompt once and permanently suppresses verified installation reminders', async () => {
  const hook = renderHook(usePwaInstall);
  const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome: 'accepted' as const }),
  }) as InstallPromptEvent;
  act(() => {
    window.dispatchEvent(event);
  });
  expect(event.defaultPrevented).toBe(true);
  expect(hook.result.current.canPrompt).toBe(true);
  await act(async () => {
    expect(await hook.result.current.promptInstall()).toBe('accepted');
  });
  expect(event.prompt).toHaveBeenCalledTimes(1);
  expect(await hook.result.current.promptInstall()).toBe('unavailable');
  act(() => {
    window.dispatchEvent(new Event('appinstalled'));
  });
  expect(installReminderDue(Date.now() + 2 * INSTALL_REMINDER_INTERVAL)).toBe(false);
  hook.unmount();
});
it('handles cancellation and a rejected system prompt without throwing', async () => {
  const hook = renderHook(usePwaInstall);
  for (const outcome of ['dismissed', 'unavailable'] as const) {
    const event = Object.assign(new Event('beforeinstallprompt'), {
      prompt:
        outcome === 'dismissed'
          ? vi.fn().mockResolvedValue(undefined)
          : vi.fn().mockRejectedValue(new Error('not allowed')),
      userChoice: Promise.resolve({ outcome: 'dismissed' as const }),
    });
    act(() => {
      window.dispatchEvent(event);
    });
    await act(async () => {
      expect(await hook.result.current.promptInstall()).toBe(outcome);
    });
  }
  hook.unmount();
});
