import { env } from '@/shared/config/env';

import { idbFallback, type AsyncStorage } from './idb-fallback';
import { storageOperation } from './errors';

/** Native key/value поверх @capacitor/preferences (UserDefaults/SharedPreferences). */
const prefsStorage: AsyncStorage = {
  async getItem(key) {
    const { Preferences } = await import('@capacitor/preferences');
    const { value } = await storageOperation(() => Preferences.get({ key }));
    return value ?? null;
  },
  async setItem(key, value) {
    const { Preferences } = await import('@capacitor/preferences');
    await storageOperation(() => Preferences.set({ key, value }));
  },
  async removeItem(key) {
    const { Preferences } = await import('@capacitor/preferences');
    await storageOperation(() => Preferences.remove({ key }));
  },
};

/** session/workout сторы: Preferences в native (не вычищается ОС), idb в web. */
export const kvPrefs: AsyncStorage = env.isNative ? prefsStorage : idbFallback;
