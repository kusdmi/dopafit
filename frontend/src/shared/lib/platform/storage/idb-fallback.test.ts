import { beforeEach, describe, expect, it } from 'vitest';
import { clear } from 'idb-keyval';

import { idbFallback } from './idb-fallback';

describe('idbFallback', () => {
  beforeEach(async () => {
    await clear();
  });

  it('round-trips a value', async () => {
    await idbFallback.setItem('k', 'v');
    expect(await idbFallback.getItem('k')).toBe('v');
  });

  it('returns null for a missing key', async () => {
    expect(await idbFallback.getItem('missing')).toBeNull();
  });

  it('removes a value', async () => {
    await idbFallback.setItem('k', 'v');
    await idbFallback.removeItem('k');
    expect(await idbFallback.getItem('k')).toBeNull();
  });
});
