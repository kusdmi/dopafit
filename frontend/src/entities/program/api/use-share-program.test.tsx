import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, it } from 'vitest';

import { useShareProgram } from './use-share-program';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

it('shares a standard program and returns a non-standard copy', async () => {
  const { result } = renderHook(() => useShareProgram('std-strength'), { wrapper });
  const copy = await result.current.mutateAsync('client-stub-1');
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(copy?.is_standard).toBe(false);
  expect(copy?.name).toBeTruthy();
});
