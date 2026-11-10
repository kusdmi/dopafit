import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
  dehydrate,
  hydrate,
} from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { server } from '@/app/mocks/server';
import { env } from '@/shared/config/env';
import {
  EXERCISE_PAGE_CACHE_LIMIT,
  boundExerciseSnapshot,
} from '@/shared/lib/query/exercise-cache';
import { useExercises } from './use-exercises';

function setup() {
  const requests: number[] = [];
  server.use(
    http.get(`${env.apiUrl}/api/v1/exercises`, ({ request }) => {
      const url = new URL(request.url);
      const offset = Number(url.searchParams.get('offset'));
      expect(url.searchParams.get('limit')).toBe('40');
      requests.push(offset);
      return HttpResponse.json({
        total: 10_000,
        items: Array.from({ length: 40 }, (_, i) => ({
          id: `item-${offset + i}`,
          name: `Упражнение ${offset + i}`,
          category_id: 'cat-chest',
          difficulty: 'beginner',
          ownership: 'global',
          is_favorite: false,
        })),
      });
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, requests, wrapper };
}

it('loads one page initially, bounds pages across long scrolling and searches, and reloads evicted pages', async () => {
  const { client, requests, wrapper } = setup();
  const { result, rerender, unmount } = renderHook(
    ({ start, search }) => useExercises({ search }, { start, end: start + 10 }),
    {
      wrapper,
      initialProps: { start: 0, search: '' },
    },
  );
  await waitFor(() => expect(result.current.itemAt(0)?.id).toBe('item-0'));
  expect(requests).toEqual([0]);
  expect(result.current.data?.total).toBe(10_000);
  for (let page = 1; page < 35; page++) {
    const start = page * 40;
    rerender({ start, search: page > 20 ? `поиск ${page}` : '' });
    await waitFor(() => expect(result.current.itemAt(start)?.id).toBe(`item-${start}`));
    expect(
      client.getQueryCache().findAll({ queryKey: ['exercises', 'list'] }).length,
    ).toBeLessThanOrEqual(EXERCISE_PAGE_CACHE_LIMIT);
  }
  expect(
    client
      .getQueryCache()
      .getAll()
      .reduce((n, q) => n + ((q.state.data as { items: unknown[] })?.items.length ?? 0), 0),
  ).toBeLessThanOrEqual(480);
  rerender({ start: 0, search: '' });
  await waitFor(() => expect(result.current.itemAt(0)?.id).toBe('item-0'));
  expect(requests.filter((offset) => offset === 0)).toHaveLength(2);
  unmount();
  client.clear();
});

it('cancels superseded searches and does not show previous-filter results', async () => {
  const { client, wrapper } = setup();
  let aborted = false;
  let started = false;
  server.use(
    http.get(`${env.apiUrl}/api/v1/exercises`, async ({ request }) => {
      if (new URL(request.url).searchParams.get('search') !== 'slow')
        return HttpResponse.json({ items: [], total: 0 });
      started = true;
      await new Promise<void>((resolve) =>
        request.signal.addEventListener(
          'abort',
          () => {
            aborted = true;
            resolve();
          },
          { once: true },
        ),
      );
      return HttpResponse.json({ items: [], total: 999 });
    }),
  );
  const { result, rerender, unmount } = renderHook(({ search }) => useExercises({ search }), {
    wrapper,
    initialProps: { search: 'slow' },
  });
  await waitFor(() => expect(started).toBe(true));
  rerender({ search: 'empty' });
  await waitFor(() => expect(result.current.data?.total).toBe(0));
  await waitFor(() => expect(aborted).toBe(true));
  expect(result.current.data?.items).toEqual([]);
  unmount();
  client.clear();
});

it('restores cached pages offline and pauses missing pages without fetching', async () => {
  const { client, wrapper, requests } = setup();
  const first = renderHook(() => useExercises({}), { wrapper });
  await waitFor(() => expect(first.result.current.itemAt(0)?.id).toBe('item-0'));
  const snapshot = dehydrate(client);
  first.unmount();
  client.clear();
  hydrate(client, snapshot);
  act(() => onlineManager.setOnline(false));
  const { result, rerender, unmount } = renderHook(
    ({ start }) => useExercises({}, { start, end: start + 10 }),
    { wrapper, initialProps: { start: 0 } },
  );
  expect(result.current.itemAt(0)?.id).toBe('item-0');
  rerender({ start: 80 });
  await waitFor(() => expect(result.current.isPaused).toBe(true));
  expect(result.current.data?.total).toBe(10_000);
  expect(result.current.itemAt(80)).toBeUndefined();
  expect(requests).toEqual([0]);
  unmount();
  client.clear();
  onlineManager.setOnline(true);
});

it('caps disk snapshots, removes legacy full catalogues, and leaves other data intact', () => {
  const client = new QueryClient();
  client.setQueryData(['exercises', 'list', {}], { items: Array(10000).fill('legacy') });
  client.setQueryData(['programs', 'list'], [{ id: 'offline-draft' }]);
  for (let offset = 0; offset < 30; offset++)
    client.setQueryData(['exercises', 'list', {}, offset * 40], { items: [] });
  const snapshot = dehydrate(client);
  const queries = boundExerciseSnapshot(snapshot.queries);
  expect(queries.filter((q) => q.queryKey[0] === 'exercises')).toHaveLength(12);
  expect(queries.find((q) => q.queryKey[0] === 'programs')?.state.data).toEqual([
    { id: 'offline-draft' },
  ]);
  expect(queries.some((q) => q.queryKey[0] === 'exercises' && q.queryKey.length < 4)).toBe(false);
  client.clear();
});
