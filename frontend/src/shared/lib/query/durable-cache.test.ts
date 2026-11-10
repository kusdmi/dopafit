import { QueryClient, dehydrate, onlineManager } from '@tanstack/react-query';
import { persistQueryClientRestore } from '@tanstack/react-query-persist-client';
import { afterEach, expect, it, vi } from 'vitest';
import { persistStorage } from '@/shared/lib/platform/storage/query-cache';
import {
  PERSIST_MAX_AGE,
  persistOfflineState,
  queryPersister,
  shouldDehydrateMutation,
} from './persistQueryClient';
import { getStorageError, clearStorageError } from '@/shared/lib/platform/storage/errors';

afterEach(() => {
  onlineManager.setOnline(true);
  vi.restoreAllMocks();
  clearStorageError();
});

it('expires server queries while retaining the offline outbox beyond 24 hours', async () => {
  onlineManager.setOnline(false);
  const source = new QueryClient();
  source.setQueryData(['programs'], [{ id: 'stale' }]);
  const mutation = source
    .getMutationCache()
    .build(source, { mutationKey: ['save-test'], mutationFn: async () => 'ok' });
  void mutation.execute({ id: 'client-uuid', name: 'Offline draft' });
  await Promise.resolve();
  await persistStorage.setItem(
    'dopafit-query-cache',
    JSON.stringify({
      timestamp: Date.now() - PERSIST_MAX_AGE * 3,
      buster: '',
      clientState: dehydrate(source, { shouldDehydrateMutation }),
    }),
  );
  const restored = new QueryClient();
  await persistQueryClientRestore({
    queryClient: restored,
    persister: queryPersister,
    maxAge: PERSIST_MAX_AGE,
  });
  expect(restored.getQueryData(['programs'])).toBeUndefined();
  expect(restored.getMutationCache().getAll()).toHaveLength(1);
  expect(restored.getMutationCache().getAll()[0].state.variables).toEqual({
    id: 'client-uuid',
    name: 'Offline draft',
  });
});

it('waits for the physical write before confirming an offline save', async () => {
  let release!: () => void;
  vi.spyOn(persistStorage, 'setItem').mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  let confirmed = false;
  const saving = persistOfflineState(new QueryClient()).then(() => {
    confirmed = true;
  });
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  expect(confirmed).toBe(false);
  release();
  await saving;
  expect(confirmed).toBe(true);
});

it('rejects failed local saves and exposes a visible storage error', async () => {
  vi.spyOn(persistStorage, 'setItem').mockRejectedValue(new Error('Quota exceeded'));
  await expect(persistOfflineState(new QueryClient())).rejects.toThrow('Quota exceeded');
  expect(getStorageError()).toContain('Не удалось');
});

it('serializes removal after pending writes so logout cannot resurrect the cache', async () => {
  let release!: () => void;
  const order: string[] = [];
  vi.spyOn(persistStorage, 'setItem').mockImplementation(async () => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    order.push('write');
  });
  vi.spyOn(persistStorage, 'removeItem').mockImplementation(async () => {
    order.push('remove');
  });
  const saving = persistOfflineState(new QueryClient());
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  const removing = queryPersister.removeClient();
  release();
  await saving;
  await removing;
  expect(order).toEqual(['write', 'remove']);
});

it('stays silent when a queued snapshot is dropped because the session changed', async () => {
  let releaseFirst!: () => void;
  vi.spyOn(persistStorage, 'setItem').mockImplementationOnce(async () => {
    await new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
  });
  const snapshot = () => ({
    timestamp: Date.now(),
    buster: '',
    clientState: { mutations: [], queries: [] },
  });
  // A first write is in flight, so the second one queues behind it. The sign-out
  // lands in between: by the time the queued write runs, its snapshot belongs to
  // the previous session and must be dropped rather than written back. Nothing is
  // lost, so warning about device storage here is a false alarm the user would
  // see on an ordinary logout.
  const inFlight = queryPersister.persistClient(snapshot());
  await vi.waitFor(() => expect(releaseFirst).toBeTypeOf('function'));
  const queued = queryPersister.persistClient(snapshot());
  const removed = queryPersister.removeClient();
  releaseFirst();
  await Promise.all([inFlight, queued, removed]);
  expect(getStorageError()).toBeNull();
});

it('coalesces background snapshots when storage is slow', async () => {
  let release!: () => void;
  const store = vi.spyOn(persistStorage, 'setItem').mockImplementationOnce(async () => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
  });
  const snapshot = (timestamp: number) => ({
    timestamp,
    buster: '',
    clientState: { mutations: [], queries: [] },
  });
  const first = queryPersister.persistClient(snapshot(1));
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  const pending = Array.from({ length: 100 }, (_, index) =>
    queryPersister.persistClient(snapshot(index + 2)),
  );
  expect(store).toHaveBeenCalledTimes(1);
  release();
  await Promise.all([first, ...pending]);
  expect(store).toHaveBeenCalledTimes(2);
  expect(JSON.parse(store.mock.calls[1][1]).timestamp).toBe(101);
});

it('never overwrites a confirmed offline save with an older queued background snapshot', async () => {
  let release!: () => void;
  const stored: string[] = [];
  vi.spyOn(persistStorage, 'setItem').mockImplementation(async (_key, value) => {
    if (stored.length === 0)
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    stored.push(value);
  });
  const snapshot = (timestamp: number) => ({
    timestamp,
    buster: '',
    clientState: { mutations: [], queries: [] },
  });
  const first = queryPersister.persistClient(snapshot(1));
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  const obsolete = queryPersister.persistClient(snapshot(2));
  const client = new QueryClient();
  client.setQueryData(['programs', 'list'], [{ id: 'saved-offline' }]);
  const durable = persistOfflineState(client);
  release();
  await Promise.all([first, obsolete, durable]);
  expect(stored).toHaveLength(2);
  expect(JSON.parse(stored[1]).clientState.queries[0].state.data).toEqual([
    { id: 'saved-offline' },
  ]);
  client.clear();
});
