import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Preferences } from '@capacitor/preferences';
import { tokenStorage } from '@/shared/api/tokens';
import { secureTokens } from './secure-tokens';
import { ensureFreshInstall } from './install-marker';

describe('ensureFreshInstall', () => {
  beforeEach(async () => {
    await Preferences.remove({ key: 'dopafit.install_marker' });
    await secureTokens.clear();
    vi.clearAllMocks();
  });

  it('clears tokens and sets the marker on a fresh install', async () => {
    await secureTokens.set('stale-access', 'stale-refresh');
    await ensureFreshInstall();
    expect(await secureTokens.getAccess()).toBeNull();
    const { value } = await Preferences.get({ key: 'dopafit.install_marker' });
    expect(value).toBe('1');
  });

  it('is a no-op when the marker already exists', async () => {
    await Preferences.set({ key: 'dopafit.install_marker', value: '1' });
    await secureTokens.set('keep-access', 'keep-refresh');
    await ensureFreshInstall();
    expect(await secureTokens.getAccess()).toBe('keep-access');
  });

  it('bumps the session generation on a fresh install so an in-flight refresh bails', async () => {
    const before = tokenStorage.getGeneration();
    await ensureFreshInstall();
    // Routing the wipe through tokenStorage.clear() (not the low-level backend)
    // advances the generation, so a refresh started before the marker check is
    // treated as belonging to a torn-down session and won't resurrect tokens.
    expect(tokenStorage.getGeneration()).toBeGreaterThan(before);
  });
});
