import { del, get, set } from 'idb-keyval';
import { storageOperation } from './errors';

/** Минимальный async key/value интерфейс, совместимый с zustand createJSONStorage. */
export interface AsyncStorage {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}

/** Web/PWA-бэкенд для всех адаптеров хранилища: idb-keyval под AsyncStorage. */
export const idbFallback: AsyncStorage = {
  getItem: async (key) => (await storageOperation(() => get<string>(key))) ?? null,
  setItem: async (key, value) => {
    await storageOperation(() => set(key, value));
  },
  removeItem: async (key) => {
    await storageOperation(() => del(key));
  },
};
