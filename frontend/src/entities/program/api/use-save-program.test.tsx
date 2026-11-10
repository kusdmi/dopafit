import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useSaveProgram } from './use-save-program';

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function wrapper({ children }: { children: ReactNode }) {
  const qc = makeClient();
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function programBody(id = globalThis.crypto.randomUUID()) {
  return {
    id,
    name: 'Моя программа',
    kind: 'strength' as const,
    days: [
      {
        id: globalThis.crypto.randomUUID(),
        name: 'День 1',
        position: 0,
        slots: [
          {
            id: globalThis.crypto.randomUUID(),
            position: 0,
            exercises: [
              {
                id: globalThis.crypto.randomUUID(),
                exercise_id: null,
                custom_name: 'Приседания',
                sets: 4,
                reps: 10,
                variant_order: 0,
              },
            ],
          },
        ],
      },
    ],
  };
}

describe('useSaveProgram', () => {
  it('creates a program tree online', async () => {
    const { result } = renderHook(() => useSaveProgram(), { wrapper });
    result.current.mutate({ body: programBody() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.name).toBe('Моя программа');
  });

  it('invalidates both the program list and the detail query on update (PUT)', async () => {
    const qc = makeClient();
    const spy = vi.spyOn(qc, 'invalidateQueries');
    const programId = globalThis.crypto.randomUUID();
    const { api } = await import('@/shared/api/client');
    const created = await api.POST('/api/v1/programs', { body: programBody(programId) });
    expect(created.data).toBeDefined();
    const { result } = renderHook(() => useSaveProgram(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      ),
    });

    result.current.mutate({
      body: programBody(programId),
      programId,
      expectedUpdatedAt: created.data!.updated_at,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = spy.mock.calls.map((c) =>
      JSON.stringify((c[0] as { queryKey: unknown }).queryKey),
    );
    expect(keys).toContain(JSON.stringify(['programs', 'list']));
    expect(keys).toContain(JSON.stringify(['programs', 'detail', programId]));
  });

  it('does not invalidate a detail query on create (POST)', async () => {
    const qc = makeClient();
    const spy = vi.spyOn(qc, 'invalidateQueries');
    const { result } = renderHook(() => useSaveProgram(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      ),
    });

    result.current.mutate({ body: programBody() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = spy.mock.calls.map((c) =>
      JSON.stringify((c[0] as { queryKey: unknown }).queryKey),
    );
    expect(keys).toContain(JSON.stringify(['programs', 'list']));
    expect(keys.some((k) => k.startsWith(JSON.stringify(['programs', 'detail'])))).toBe(false);
  });
});
