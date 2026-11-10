import { afterEach, describe, expect, it, vi } from 'vitest';

const removeItem = vi.fn(async () => {});
const del = vi.fn(async () => {});

// The persister must be cleared through its own adapter (removeClient), not a raw
// idb-keyval del of the cache key — otherwise the cache/outbox survive on native.
vi.mock('@/shared/lib/platform/storage/query-cache', () => ({
  persistStorage: { removeItem },
}));
vi.mock('idb-keyval', () => ({ del }));

describe('clearPersistedQueryCache', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('clears the persisted cache through the persister adapter, not a raw cache-key del', async () => {
    const { clearPersistedQueryCache } = await import('./persistQueryClient');
    await clearPersistedQueryCache();

    expect(removeItem).toHaveBeenCalledWith('dopafit-query-cache');
    // Must NOT delete the persister's cache key directly through idb-keyval
    // (that path is a no-op on native SQLite and leaks the previous user's data).
    expect(del).not.toHaveBeenCalledWith('dopafit-query-cache');
  });
});
