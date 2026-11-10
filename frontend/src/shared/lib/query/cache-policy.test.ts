import { QueryClient, QueryObserver, dehydrate, onlineManager } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import {
  bindQueryCache,
  boundQuerySnapshot,
  QUERY_CACHE_LIMIT,
  QUERY_GC_TIME,
} from './cache-policy';

let dispose = () => {};
afterEach(() => {
  dispose();
  onlineManager.setOnline(true);
  vi.useRealTimers();
});

it('bounds all screens and filter combinations while retaining optimistic offline data', async () => {
  const client = new QueryClient();
  dispose = bindQueryCache(client);
  client.setQueryData(['programs', 'list'], [{ id: 'draft' }]);
  client.setQueryData(['measurements', 'list'], { items: [{ id: 'unsynced' }] });
  onlineManager.setOnline(false);
  const mutation = client
    .getMutationCache()
    .build(client, { mutationKey: ['programs', 'save'], mutationFn: async () => ({}) });
  void mutation.execute({ programId: 'pending-program', body: { name: 'Черновик' } });
  client.setQueryData(['programs', 'detail', 'pending-program'], { name: 'Черновик' });
  for (let i = 0; i < 250; i++)
    client.setQueryData([i % 2 ? 'analytics' : 'calendar', { month: i }], { result: i });
  await vi.waitFor(() => expect(client.getQueryCache().getAll()).toHaveLength(QUERY_CACHE_LIMIT));
  expect(client.getQueryData(['programs', 'detail', 'pending-program'])).toEqual({
    name: 'Черновик',
  });
  expect(client.getQueryData(['programs', 'list'])).toEqual([{ id: 'draft' }]);
  expect(client.getQueryData(['measurements', 'list'])).toEqual({ items: [{ id: 'unsynced' }] });
  const snapshot = boundQuerySnapshot(dehydrate(client));
  expect(snapshot.mutations).toHaveLength(1);
  expect(snapshot.mutations[0].state.variables).toEqual({
    programId: 'pending-program',
    body: { name: 'Черновик' },
  });
  client.clear();
});

it('bounds payload size on disk and in memory, even for a small number of large responses', async () => {
  const client = new QueryClient();
  client.setQueryData(['analytics', 'oversized'], { data: 'x'.repeat(5 * 1024 * 1024) });
  client.setQueryData(['calendar', 'recent'], { days: [] });
  const snapshot = boundQuerySnapshot(dehydrate(client));
  expect(snapshot.queries.map((q) => q.queryKey)).toEqual([['calendar', 'recent']]);
  dispose = bindQueryCache(client);
  await vi.waitFor(() => expect(client.getQueryCache().getAll()).toHaveLength(1));
  expect(client.getQueryData(['calendar', 'recent'])).toEqual({ days: [] });
  client.clear();
});

it('collects inactive queries after five minutes and preserves a pending mutation beyond that time', async () => {
  vi.useFakeTimers();
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  dispose = bindQueryCache(client);
  onlineManager.setOnline(false);
  const mutation = client
    .getMutationCache()
    .build(client, { mutationKey: ['workouts', 'sync'], mutationFn: async () => ({}) });
  void mutation.execute({ id: 'session-offline' });
  client.setQueryData(['workouts', 'summary', 'session-offline'], { seq_number: 0 });
  client.setQueryData(['analytics', 'old'], { result: 'old' });
  await vi.advanceTimersByTimeAsync(QUERY_GC_TIME + 60_000);
  expect(client.getQueryData(['analytics', 'old'])).toBeUndefined();
  expect(client.getQueryData(['workouts', 'summary', 'session-offline'])).toEqual({
    seq_number: 0,
  });
  expect(client.getMutationCache().getAll()[0].state.variables).toEqual({ id: 'session-offline' });
  client.clear();
});

it('never evicts mounted screens under cache pressure', async () => {
  const client = new QueryClient();
  const activeKey = ['analytics', 'active'];
  client.setQueryData(activeKey, { selected: 'current' });
  const observer = new QueryObserver(client, { queryKey: activeKey, enabled: false });
  const stop = observer.subscribe(() => {});
  dispose = bindQueryCache(client);
  for (let index = 0; index < 150; index++)
    client.setQueryData(['calendar', index], { month: index });
  await vi.waitFor(() => expect(client.getQueryCache().getAll()).toHaveLength(QUERY_CACHE_LIMIT));
  expect(client.getQueryData(activeKey)).toEqual({ selected: 'current' });
  stop();
  client.clear();
});
