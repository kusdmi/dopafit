import { env } from '@/shared/config/env';

import { idbFallback } from './idb-fallback';

const ACCESS_KEY = 'dopafit.access_token';
const REFRESH_KEY = 'dopafit.refresh_token';

export interface TokenStorage {
  getAccess: () => Promise<string | null>;
  getRefresh: () => Promise<string | null>;
  set: (access: string, refresh: string) => Promise<void>;
  clear: () => Promise<void>;
}

/** Низкоуровневый key/value бэкенд токенов: Keychain/Keystore в native, idb в web. */
interface SecureBackend {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
  remove: (key: string) => Promise<void>;
}

function nativeBackend(): SecureBackend {
  return {
    async get(key) {
      const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
      const value = await SecureStorage.get(key);
      // Храним только строковые токены; всё прочее трактуем как промах.
      return typeof value === 'string' ? value : null;
    },
    async set(key, value) {
      const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
      await SecureStorage.set(key, value);
    },
    async remove(key) {
      const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
      await SecureStorage.remove(key);
    },
  };
}

const webBackend: SecureBackend = {
  get: (key) => idbFallback.getItem(key),
  set: (key, value) => idbFallback.setItem(key, value),
  remove: (key) => idbFallback.removeItem(key),
};

const backend: SecureBackend = env.isNative ? nativeBackend() : webBackend;

export const secureTokens: TokenStorage = {
  getAccess: () => backend.get(ACCESS_KEY),
  getRefresh: () => backend.get(REFRESH_KEY),
  async set(access, refresh) {
    await backend.set(ACCESS_KEY, access);
    await backend.set(REFRESH_KEY, refresh);
  },
  async clear() {
    await backend.remove(ACCESS_KEY);
    await backend.remove(REFRESH_KEY);
  },
};
