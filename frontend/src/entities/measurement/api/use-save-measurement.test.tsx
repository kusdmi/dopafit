import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/shared/api/client';
import {
  clearFailedMutations,
  listFailedMutations,
  setFailedMutationAuthGate,
} from '@/shared/lib/offline/failed-mutations';

import { measurementsListKey } from './use-measurements';
import { useSaveMeasurement } from './use-save-measurement';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient();
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useSaveMeasurement', () => {
  beforeEach(async () => {
    await clearFailedMutations();
    setFailedMutationAuthGate(() => true);
  });
  afterEach(async () => {
    await clearFailedMutations();
    vi.restoreAllMocks();
  });

  it('persists to the failed outbox AND rolls back optimism on an in-session failure (MAJOR-1)', async () => {
    // Retriable server error (5xx surfaces as network_error).
    vi.spyOn(api, 'POST').mockResolvedValue({
      data: undefined,
      error: { code: 'network_error', message: 'boom' },
    } as never);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const previousList = { items: [], total: 0 };
    qc.setQueryData(measurementsListKey, previousList);
    const isolatedWrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useSaveMeasurement(), { wrapper: isolatedWrapper });
    await result.current
      .mutateAsync({ id: 'x', date: '2026-02-02', weight: 70, custom_values: [] } as never)
      .catch(() => {});

    await waitFor(() => expect(result.current.isError).toBe(true));

    // Rollback: the optimistic row is gone, the cache holds the previous snapshot.
    expect(qc.getQueryData(measurementsListKey)).toEqual(previousList);

    // Persisted for manual retry instead of being silently dropped.
    const items = await vi.waitFor(async () => {
      const current = await listFailedMutations();
      expect(current).toHaveLength(1);
      return current;
    });
    expect(items[0].label).toBe('Замер');
  });

  it('does NOT persist a non-retriable 4xx (validation_error) in-session (MAJOR-2b)', async () => {
    vi.spyOn(api, 'POST').mockResolvedValue({
      data: undefined,
      error: { code: 'validation_error', message: 'bad' },
    } as never);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const isolatedWrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useSaveMeasurement(), { wrapper: isolatedWrapper });
    await result.current
      .mutateAsync({ id: 'x', date: '2026-02-02', custom_values: [] } as never)
      .catch(() => {});
    await waitFor(() => expect(result.current.isError).toBe(true));
    await Promise.resolve();
    expect(await listFailedMutations()).toEqual([]);
  });

  it('creates a measurement online', async () => {
    const { result } = renderHook(() => useSaveMeasurement(), { wrapper });
    result.current.mutate({ id: globalThis.crypto.randomUUID(), date: '2026-06-13', weight: 80.5, custom_values: [] });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.weight).toBe(80.5);
  });

  it('invalidates both the measurements list and analytics queries on settle', async () => {
    vi.spyOn(api, 'POST').mockResolvedValue({
      data: {
        id: 'm1',
        date: '2026-01-01',
        custom_values: [],
        photos: [],
        updated_at: new Date().toISOString(),
      },
      error: undefined,
    } as never);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    const isolatedWrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useSaveMeasurement(), { wrapper: isolatedWrapper });
    await result.current.mutateAsync({
      date: '2026-01-01',
      custom_values: [],
    } as never);

    await waitFor(() => {
      const keys = invalidateSpy.mock.calls.map(([arg]) => JSON.stringify(arg?.queryKey));
      expect(keys).toContain(JSON.stringify(measurementsListKey));
      expect(keys).toContain(JSON.stringify(['analytics']));
    });
  });
});
