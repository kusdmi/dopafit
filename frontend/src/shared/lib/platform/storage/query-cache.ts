import { get, set, del } from 'idb-keyval';

import { env } from '@/shared/config/env';
import { reportStorageError, storageOperation } from './errors';

/** Минимальный интерфейс, который ждёт createAsyncStoragePersister. */
export interface AsyncStorage {
  getItem: (key: string) => Promise<string | null | undefined>;
  setItem: (key: string, value: string) => Promise<unknown>;
  removeItem: (key: string) => Promise<void>;
}

export const webStorage: AsyncStorage = {
  getItem: (key) => storageOperation(() => get<string>(key)),
  setItem: (key, value) => storageOperation(() => set(key, value)),
  removeItem: (key) => storageOperation(() => del(key)),
};

/**
 * Нативный SQLite-бэкенд: iOS WKWebView периодически вычищает IndexedDB,
 * поэтому offline-кэш и outbox держим в SQLite, который ОС не трогает.
 * Ленивая инициализация одной таблицы key/value.
 */
function createSqliteStorage(): AsyncStorage {
  let ready: Promise<{
    run: (stmt: string, values?: unknown[]) => Promise<unknown>;
    query: (stmt: string, values?: unknown[]) => Promise<{ values?: Record<string, string>[] }>;
  }> | null = null;

  function db() {
    if (!ready) {
      ready = (async () => {
        const { CapacitorSQLite, SQLiteConnection } = await import('@capacitor-community/sqlite');
        const conn = new SQLiteConnection(CapacitorSQLite);
        // createConnection бросает на повторном вызове ("Connection already exists"),
        // что ломает hot-reload и повторную инициализацию — переиспользуем существующее.
        const exists = (await conn.isConnection('dopafit', false)).result;
        const database = exists
          ? await conn.retrieveConnection('dopafit', false)
          : await conn.createConnection('dopafit', false, 'no-encryption', 1, false);
        await database.open();
        await database.execute(
          'CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);',
        );
        return {
          run: (stmt: string, values?: unknown[]) => database.run(stmt, values),
          query: (stmt: string, values?: unknown[]) =>
            database.query(stmt, values) as Promise<{ values?: Record<string, string>[] }>,
        };
      })().catch((e: unknown) => {
        // Сбой инициализации не должен отравлять адаптер навсегда —
        // сбрасываем мемоизацию, чтобы следующий вызов смог повторить попытку.
        ready = null;
        throw e;
      });
    }
    return ready;
  }

  return {
    async getItem(key) {
      try {
        const conn = await db();
        const res = await conn.query('SELECT v FROM kv WHERE k = ?;', [key]);
        return res.values?.[0]?.v ?? null;
      } catch (error) {
        reportStorageError();
        throw error;
      }
    },
    async setItem(key, value) {
      try {
        const conn = await db();
        await conn.run('INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?);', [key, value]);
      } catch (error) {
        reportStorageError();
        throw error;
      }
    },
    async removeItem(key) {
      try {
        const conn = await db();
        await conn.run('DELETE FROM kv WHERE k = ?;', [key]);
      } catch (error) {
        reportStorageError();
        throw error;
      }
    },
  };
}

/** Web/PWA → idb-keyval; native → SQLite. */
export const persistStorage: AsyncStorage = env.isNative ? createSqliteStorage() : webStorage;
