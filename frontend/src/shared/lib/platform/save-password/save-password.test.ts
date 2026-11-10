import { Capacitor } from '@capacitor/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { saveCredential } from './save-password';

const { promptDialog } = vi.hoisted(() => ({ promptDialog: vi.fn(async () => {}) }));

vi.mock('@capgo/capacitor-autofill-save-password', () => ({
  SavePassword: { promptDialog },
}));

describe('saveCredential', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    promptDialog.mockClear();
    promptDialog.mockResolvedValue(undefined);
  });

  it('prompts the ios keychain dialog on ios', async () => {
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('ios');
    await saveCredential('user@example.com', 'Secret1x');
    expect(promptDialog).toHaveBeenCalledExactlyOnceWith({
      username: 'user@example.com',
      password: 'Secret1x',
    });
  });

  it('is a no-op on web and android (browser/autofill handle it)', async () => {
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('web');
    await saveCredential('user@example.com', 'Secret1x');
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android');
    await saveCredential('user@example.com', 'Secret1x');
    expect(promptDialog).not.toHaveBeenCalled();
  });

  it('never throws: a failed prompt must not break the auth flow', async () => {
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('ios');
    promptDialog.mockRejectedValueOnce(new Error('associated domains not configured'));
    await expect(saveCredential('user@example.com', 'Secret1x')).resolves.toBeUndefined();
  });
});
