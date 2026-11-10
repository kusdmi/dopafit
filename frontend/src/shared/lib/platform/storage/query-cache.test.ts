import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';

import { persistStorage, webStorage } from './query-cache';

// В jsdom Capacitor.isNativePlatform() === false, поэтому persistStorage === webStorage.
describe('persistStorage (web idb path)', () => {
  beforeEach(async () => {
    await persistStorage.removeItem('k1');
  });

  it('persistStorage falls back to webStorage in non-native env', () => {
    expect(persistStorage).toBe(webStorage);
  });

  it('round-trips set → get → remove', async () => {
    await persistStorage.setItem('k1', 'hello');
    expect(await persistStorage.getItem('k1')).toBe('hello');

    await persistStorage.removeItem('k1');
    expect(await persistStorage.getItem('k1')).toBeUndefined();
  });

  it('returns nullish for a missing key', async () => {
    expect(await persistStorage.getItem('does-not-exist')).toBeUndefined();
  });
});
