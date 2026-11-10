import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/config/env', () => ({ env: { isNative: false } }));

import { clear as idbClear } from 'idb-keyval';
import { kvPrefs } from './kv-prefs';

describe('kvPrefs (web fallback)', () => {
  beforeEach(async () => {
    await idbClear();
  });

  it('round-trips a value', async () => {
    await kvPrefs.setItem('dopafit.session', '{"user":1}');
    expect(await kvPrefs.getItem('dopafit.session')).toBe('{"user":1}');
  });

  it('returns null for a missing key', async () => {
    expect(await kvPrefs.getItem('nope')).toBeNull();
  });

  it('removes a value', async () => {
    await kvPrefs.setItem('k', 'v');
    await kvPrefs.removeItem('k');
    expect(await kvPrefs.getItem('k')).toBeNull();
  });
});
