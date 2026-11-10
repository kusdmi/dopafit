import { beforeEach, describe, expect, it, vi } from 'vitest';

// idb-keyval backs BOTH the legacy queue (which held live Blobs) and the web
// persistStorage adapter under the SAME key. fake-indexeddb's structured clone
// drops Blobs, which would make a legacy-migration test meaningless, so back
// idb-keyval with a plain in-memory Map that preserves real Blob objects.
const idbStore = new Map<string, unknown>();
vi.mock('idb-keyval', () => ({
  get: vi.fn(async (key: string) => idbStore.get(key)),
  set: vi.fn(async (key: string, value: unknown) => {
    idbStore.set(key, value);
  }),
  del: vi.fn(async (key: string) => {
    idbStore.delete(key);
  }),
  clear: vi.fn(async () => {
    idbStore.clear();
  }),
}));

const { del: idbDel, get: idbGet, set: idbSet } = await import('idb-keyval');

const {
  clearPhotoQueue,
  dequeueAllForMeasurement,
  dequeueById,
  dequeueForMeasurement,
  enqueuePhoto,
  listPendingPhotos,
  resetPhotoQueueMigrationForTests,
} = await import('./photo-queue');

const QUEUE_KEY = 'dopafit-photo-queue';

describe('photo queue', () => {
  beforeEach(async () => {
    idbStore.clear();
    resetPhotoQueueMigrationForTests();
    await idbDel(QUEUE_KEY);
    await clearPhotoQueue();
    resetPhotoQueueMigrationForTests();
  });

  it('enqueues and lists pending photos', async () => {
    const blob = new Blob(['x'], { type: 'image/jpeg' });
    await enqueuePhoto({ measurementClientId: 'm1', kind: 'front', blob, contentType: 'image/jpeg' });
    const pending = await listPendingPhotos();
    expect(pending).toHaveLength(1);
    expect(pending[0].kind).toBe('front');
  });

  it('preserves the content type across base64 persistence', async () => {
    await enqueuePhoto({
      measurementClientId: 'm1',
      kind: 'front',
      blob: new Blob(['x'], { type: 'image/png' }),
      contentType: 'image/png',
    });
    const [photo] = await listPendingPhotos();
    // The blob is rebuilt from base64 on read; its content type must survive.
    expect(photo.contentType).toBe('image/png');
    expect(photo.blob.type).toBe('image/png');
  });

  it('removes photos for a measurement after upload', async () => {
    const blob = new Blob(['x'], { type: 'image/jpeg' });
    await enqueuePhoto({ measurementClientId: 'm1', kind: 'front', blob, contentType: 'image/jpeg' });
    await dequeueForMeasurement('m1', 'front');
    expect(await listPendingPhotos()).toHaveLength(0);
  });

  it('dequeueById removes exactly one record, keeping a replacement queued', async () => {
    const blob = new Blob(['x'], { type: 'image/jpeg' });
    // First photo for (m1, front).
    await enqueuePhoto({ measurementClientId: 'm1', kind: 'front', blob, contentType: 'image/jpeg' });
    const [first] = await listPendingPhotos();
    // While the first is "uploading", the user swaps in a replacement for the SAME
    // (client, kind): enqueuePhoto gives it a fresh id and replaces the record.
    await enqueuePhoto({ measurementClientId: 'm1', kind: 'front', blob, contentType: 'image/jpeg' });
    const [replacement] = await listPendingPhotos();
    expect(replacement.id).not.toBe(first.id);

    // The drain completes for the ORIGINAL record's id. Dequeuing by that stale id
    // must be a no-op here (the record was already replaced), leaving the newer
    // photo queued so it still gets sent.
    await dequeueById(first.id);
    const pending = await listPendingPhotos();
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe(replacement.id);
  });

  it('removes every kind for a measurement when it is deleted', async () => {
    const blob = new Blob(['x'], { type: 'image/jpeg' });
    await enqueuePhoto({ measurementClientId: 'm1', kind: 'front', blob, contentType: 'image/jpeg' });
    await enqueuePhoto({ measurementClientId: 'm1', kind: 'back', blob, contentType: 'image/jpeg' });
    await enqueuePhoto({ measurementClientId: 'm2', kind: 'front', blob, contentType: 'image/jpeg' });

    await dequeueAllForMeasurement('m1');

    const pending = await listPendingPhotos();
    expect(pending.map((p) => p.measurementClientId)).toEqual(['m2']);
  });

  describe('legacy idb-keyval migration', () => {
    it('migrates legacy Blob records into the new queue and deletes the old key', async () => {
      // Seed the pre-f8bdfc5 shape: a structured-clone array of records with live
      // Blobs, stored directly under the shared idb key.
      await idbSet(QUEUE_KEY, [
        {
          id: 'old-1',
          measurementClientId: 'm-old',
          kind: 'front',
          blob: new Blob(['legacy'], { type: 'image/png' }),
          contentType: 'image/png',
        },
      ]);
      resetPhotoQueueMigrationForTests();

      const pending = await listPendingPhotos();
      expect(pending).toHaveLength(1);
      expect(pending[0].measurementClientId).toBe('m-old');
      expect(pending[0].kind).toBe('front');
      expect(pending[0].contentType).toBe('image/png');
      // The record was rebuilt as a Blob with its content type preserved.
      // (jsdom's Blob can't stream its bytes, so content fidelity of the shared
      // base64 path is covered by the enqueue/list content-type test above.)
      expect(pending[0].blob.type).toBe('image/png');

      // The legacy value is gone: what's under the key now is the new JSON string.
      const raw = await idbGet(QUEUE_KEY);
      expect(typeof raw).toBe('string');
      expect(Array.isArray(raw)).toBe(false);
    });

    it('drops corrupt legacy data without throwing and leaves an empty queue', async () => {
      // A record whose blob isn't a real Blob — conversion must not blow up.
      await idbSet(QUEUE_KEY, [
        { measurementClientId: 'x', kind: 'front', blob: null, contentType: 'image/png' },
      ]);
      resetPhotoQueueMigrationForTests();

      const pending = await listPendingPhotos();
      // Nothing salvageable -> empty queue, no exception.
      expect(pending).toHaveLength(0);
      // Old key cleared for privacy.
      const raw = await idbGet(QUEUE_KEY);
      expect(Array.isArray(raw)).toBe(false);
    });

    it('clearPhotoQueue also removes any lingering legacy idb key', async () => {
      // Simulate a legacy value that migration never reached (e.g. logout before
      // the queue was first read).
      await idbSet(QUEUE_KEY, [
        {
          id: 'leftover',
          measurementClientId: 'm-priv',
          kind: 'back',
          blob: new Blob(['secret'], { type: 'image/jpeg' }),
          contentType: 'image/jpeg',
        },
      ]);

      await clearPhotoQueue();

      const raw = await idbGet(QUEUE_KEY);
      expect(raw).toBeUndefined();
    });

    it('clearPhotoQueue mid-migration does not resurrect past-user photos', async () => {
      // Seed a legacy value so migration has real work to do.
      await idbSet(QUEUE_KEY, [
        {
          id: 'priv-1',
          measurementClientId: 'm-priv',
          kind: 'front',
          blob: new Blob(['private'], { type: 'image/jpeg' }),
          contentType: 'image/jpeg',
        },
      ]);
      resetPhotoQueueMigrationForTests();

      // Intercept persistStorage.setItem so we can inject a gap between when
      // migration finishes conversion and when it commits to the store.
      const { persistStorage } = await import(
        '@/shared/lib/platform/storage/query-cache'
      );
      let resolveWrite!: () => void;
      const writeGate = new Promise<void>((res) => {
        resolveWrite = res;
      });

      const originalSetItem = persistStorage.setItem.bind(persistStorage);
      const setItemSpy = vi
        .spyOn(persistStorage, 'setItem')
        .mockImplementationOnce(async (key: string, value: string) => {
          // Pause the migration's writeStored() call until we release the gate.
          await writeGate;
          return originalSetItem(key, value);
        });

      // Start migration in the background (triggered by listPendingPhotos).
      const migrationStarted = listPendingPhotos();

      // While migration is blocked inside writeStored(), concurrently clear.
      const cleared = clearPhotoQueue();

      // Now let the blocked write proceed.
      resolveWrite();

      // Wait for both to settle.
      await Promise.all([migrationStarted, cleared]);

      setItemSpy.mockRestore();

      // The queue must be empty — migration must not have written past-user data
      // into the store after clearPhotoQueue ran.
      const pending = await listPendingPhotos();
      expect(pending).toHaveLength(0);
    });

    it('merges legacy records into a NON-EMPTY new store (native), deduping by client+kind', async () => {
      // Native shape: persistStorage (SQLite) already holds a JSON queue while the
      // legacy idb-keyval key still carries a structured-clone array. On native the
      // two backends are distinct, so migration must MERGE — not overwrite —
      // deduping records that share (measurementClientId, kind).
      const { persistStorage } = await import('@/shared/lib/platform/storage/query-cache');

      // Pre-existing new-store record: a distinct (m-new, front) plus a colliding
      // (m-dup, front) that also appears in the legacy array (new store wins).
      const existing = JSON.stringify([
        { id: 'new-1', measurementClientId: 'm-new', kind: 'front', contentType: 'image/png', base64: '' },
        { id: 'new-2', measurementClientId: 'm-dup', kind: 'front', contentType: 'image/png', base64: '' },
      ]);
      const getSpy = vi
        .spyOn(persistStorage, 'getItem')
        .mockImplementation(async (key) => (key === QUEUE_KEY ? existing : null));
      const setSpy = vi.spyOn(persistStorage, 'setItem').mockResolvedValue(undefined);

      await idbSet(QUEUE_KEY, [
        {
          id: 'legacy-keep',
          measurementClientId: 'm-old',
          kind: 'back',
          blob: new Blob(['legacy'], { type: 'image/jpeg' }),
          contentType: 'image/jpeg',
        },
        {
          // Collides with existing (m-dup, front) — must be dropped in favour of the
          // already-persisted new-store record.
          id: 'legacy-dup',
          measurementClientId: 'm-dup',
          kind: 'front',
          blob: new Blob(['dup'], { type: 'image/jpeg' }),
          contentType: 'image/jpeg',
        },
      ]);
      resetPhotoQueueMigrationForTests();

      await listPendingPhotos();

      // Inspect what migration wrote to the new store.
      expect(setSpy).toHaveBeenCalled();
      const written = JSON.parse(setSpy.mock.calls.at(-1)![1] as string) as {
        id: string;
        measurementClientId: string;
        kind: string;
      }[];
      const ids = written.map((r) => r.id).sort();
      // legacy-keep merged in; both existing records preserved; legacy-dup dropped.
      expect(ids).toEqual(['legacy-keep', 'new-1', 'new-2']);

      getSpy.mockRestore();
      setSpy.mockRestore();
    });
  });
});
