import { expect, it, vi } from 'vitest';
const run = vi.fn(async () => { throw new Error('Disk full'); });
vi.mock('@/shared/config/env', () => ({ env: { isNative: true } }));
vi.mock('@capacitor-community/sqlite', () => ({
  CapacitorSQLite: {},
  SQLiteConnection: class {
    async isConnection() { return { result: false }; }
    async createConnection() { return { open: async () => {}, execute: async () => {}, run, query: async () => { throw new Error('Read failed'); } }; }
  },
}));

it('does not report a failed SQLite write as successful', async () => {
  const { persistStorage } = await import('./query-cache');
  await expect(persistStorage.setItem('outbox', 'draft')).rejects.toThrow('Disk full');
});
it('does not treat a failed SQLite read as an empty outbox', async () => {
  const { persistStorage } = await import('./query-cache');
  await expect(persistStorage.getItem('outbox')).rejects.toThrow('Read failed');
});
