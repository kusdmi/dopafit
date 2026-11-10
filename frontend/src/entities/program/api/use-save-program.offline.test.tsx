import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { programsListKey } from './use-programs';
import { useSaveProgram } from './use-save-program';

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

describe('useSaveProgram offline', () => {
  it('optimistically inserts the program into the list cache', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(programsListKey, []);
    const { result } = renderHook(() => useSaveProgram(), { wrapper: makeWrapper(qc) });

    act(() => {
      result.current.mutate({
        body: {
          id: globalThis.crypto.randomUUID(),
          name: 'Офлайн программа',
          kind: 'strength',
          days: [],
        },
      });
    });

    await waitFor(() => {
      const cached = qc.getQueryData(programsListKey) as { name: string }[];
      expect(cached.some((i) => i.name === 'Офлайн программа')).toBe(true);
    });
  });
});
