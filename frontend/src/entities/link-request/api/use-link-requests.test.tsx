import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, it } from 'vitest';

import { useAcceptLinkRequest } from './use-link-request-mutations';
import { useLinkRequests } from './use-link-requests';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

it('filters incoming requests', async () => {
  const { result } = renderHook(() => useLinkRequests('incoming'), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data?.every((r) => r.direction === 'incoming')).toBe(true);
});

it('accepts a request', async () => {
  const { result } = renderHook(() => useAcceptLinkRequest(), { wrapper });
  const updated = await result.current.mutateAsync('lr-incoming-1');
  expect(updated?.status).toBe('accepted');
});
