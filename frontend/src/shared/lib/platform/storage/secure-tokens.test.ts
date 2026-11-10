import { beforeEach, describe, expect, it, vi } from 'vitest';

// env.isNative selects the backend — force web (idb) path for this test.
vi.mock('@/shared/config/env', () => ({ env: { isNative: false } }));

import { clear as idbClear } from 'idb-keyval';
import { secureTokens } from './secure-tokens';

describe('secureTokens (web fallback)', () => {
  beforeEach(async () => {
    await idbClear();
  });

  it('stores and reads access + refresh tokens', async () => {
    await secureTokens.set('access-1', 'refresh-1');
    expect(await secureTokens.getAccess()).toBe('access-1');
    expect(await secureTokens.getRefresh()).toBe('refresh-1');
  });

  it('clear() removes both tokens', async () => {
    await secureTokens.set('a', 'r');
    await secureTokens.clear();
    expect(await secureTokens.getAccess()).toBeNull();
    expect(await secureTokens.getRefresh()).toBeNull();
  });

  it('returns null before anything is stored', async () => {
    expect(await secureTokens.getAccess()).toBeNull();
  });
});
