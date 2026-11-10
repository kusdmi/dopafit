import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { useSyncSession } from './use-sync-session';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useSyncSession', () => {
  it('syncs a session and returns server summary', async () => {
    const { result } = renderHook(() => useSyncSession(), { wrapper });
    result.current.mutate({
      id: globalThis.crypto.randomUUID(),
      program_id: globalThis.crypto.randomUUID(),
      day_id: globalThis.crypto.randomUUID(),
      client_id: null,
      started_at: '2026-06-16T10:00:00Z',
      finished_at: '2026-06-16T10:30:00Z',
      exercises: [],
      sets: [],
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.seq_number).toBeGreaterThanOrEqual(1);
  });
});
