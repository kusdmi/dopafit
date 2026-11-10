import { secureTokens } from '@/shared/lib/platform/storage/secure-tokens';

/**
 * Session generation counter. Bumped on every token clear (logout / unauthorized
 * teardown). An in-flight refresh captures the generation before its request and
 * skips writing the rotated pair if the generation moved meanwhile — otherwise a
 * refresh that resolves AFTER a logout would resurrect valid tokens on a device
 * that already signed out. See doRefresh in refresh.ts.
 */
let generation = 0;

/** Async-фасад токенов поверх secure storage (Keychain/Keystore | idb). */
export const tokenStorage = {
  getAccess: () => secureTokens.getAccess(),
  getRefresh: () => secureTokens.getRefresh(),
  set: (access: string, refresh: string) => secureTokens.set(access, refresh),
  clear: async () => {
    generation += 1;
    await secureTokens.clear();
  },
  /** Snapshot of the current session generation (see the counter's docstring). */
  getGeneration: () => generation,
};
