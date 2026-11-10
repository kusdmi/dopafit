import { describe, expect, it, vi } from 'vitest';

import { requestPersistentStorage } from './request-persistent';

describe('requestPersistentStorage', () => {
  it('calls navigator.storage.persist when available', async () => {
    const persist = vi.fn(async () => true);
    vi.stubGlobal('navigator', { storage: { persist } });
    await requestPersistentStorage();
    expect(persist).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it('is a no-op when the API is missing', async () => {
    vi.stubGlobal('navigator', {});
    await expect(requestPersistentStorage()).resolves.toBeUndefined();
    vi.unstubAllGlobals();
  });
});
