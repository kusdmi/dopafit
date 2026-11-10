import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, it } from 'vitest';

import { useClient } from './use-client';
import { useClients } from './use-clients';
import { useArchiveClient, useCreateClient } from './use-client-mutations';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

/** Shared QueryClient so a mutation's cache invalidation reaches sibling queries. */
function makeSharedWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function SharedWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

it('lists seeded clients with stats', async () => {
  const { result } = renderHook(() => useClients(), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data?.stats.total).toBe(2);
  expect(result.current.data?.items.length).toBe(2);
});

it('creates a stub client', async () => {
  const { result } = renderHook(() => useCreateClient(), { wrapper });
  await result.current.mutateAsync({ display_name: 'Новый' });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data?.display_name).toBe('Новый');
  expect(result.current.data?.client_user_id).toBeNull();
});

it('archive refreshes the single-client cache so status is not stale', async () => {
  const sharedWrapper = makeSharedWrapper();
  const { result } = renderHook(
    () => ({ client: useClient('client-stub-1'), archive: useArchiveClient() }),
    { wrapper: sharedWrapper },
  );
  await waitFor(() => expect(result.current.client.isSuccess).toBe(true));
  expect(result.current.client.data?.status).toBe('active');

  await result.current.archive.mutateAsync('client-stub-1');
  // The single-client query must re-fetch (invalidated by the mutation) and reflect archived.
  await waitFor(() => expect(result.current.client.data?.status).toBe('archived'));
});
