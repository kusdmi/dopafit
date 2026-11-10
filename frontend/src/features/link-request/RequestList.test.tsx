import { AppFrame } from '@/shared/ui/primitives';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import { RequestList } from './RequestList';

const networkStatus = { isOnline: true, isOffline: false };
vi.mock('@/shared/lib/network/useNetworkStatus', () => ({
  useNetworkStatus: () => networkStatus,
}));

afterEach(() => {
  networkStatus.isOnline = true;
  networkStatus.isOffline = false;
});

function renderList(direction: 'incoming' | 'outgoing') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui: ReactNode = (
    <QueryClientProvider client={qc}>
      <AppFrame>
        <RequestList direction={direction} />
      </AppFrame>
    </QueryClientProvider>
  );
  return render(ui);
}

it('shows accept/decline for an incoming pending request and accepts it', async () => {
  renderList('incoming');
  await waitFor(() => expect(screen.getByText('Принять')).toBeInTheDocument());
  fireEvent.click(screen.getByText('Принять'));
  await waitFor(() => expect(screen.queryByText('Принять')).not.toBeInTheDocument());
});

it('disables actions when offline', async () => {
  networkStatus.isOnline = false;
  networkStatus.isOffline = true;
  renderList('incoming');
  await waitFor(() => expect(screen.getByText('Принять')).toBeInTheDocument());
  expect(screen.getByText('Принять').closest('button')).toBeDisabled();
});
