import { AppFrame } from '@/shared/ui/primitives';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { useSessionStore } from '@/entities/session/model/store';
import {
  clearFailedMutations,
  enqueueFailedMutation,
} from '@/shared/lib/offline/failed-mutations';
import { SYNC_WORKOUT_KEY } from '@/shared/lib/offline/mutationKeys';
import { registerWorkoutMutationDefaults } from '@/shared/lib/offline/setupOffline';

import { FailedSyncIndicator } from './FailedSyncIndicator';

const networkState = { isOffline: false };
vi.mock('@/shared/lib/network/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ isOffline: networkState.isOffline, isOnline: !networkState.isOffline }),
}));

beforeEach(async () => {
  await clearFailedMutations();
  networkState.isOffline = false;
  useSessionStore.setState({ user: { id: 'u1', role: 'client' } as never, isAuthenticated: true });
});
afterEach(async () => {
  await clearFailedMutations();
  useSessionStore.setState({ user: null, isAuthenticated: false });
});

function renderWith(qc: QueryClient) {
  render(
    <QueryClientProvider client={qc}>
      <AppFrame>
        <FailedSyncIndicator />
      </AppFrame>
    </QueryClientProvider>,
  );
}

it('surfaces a persisted failed mutation and retries it successfully (clears the store)', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const sync = vi.fn().mockResolvedValue({ id: 's1' });
  registerWorkoutMutationDefaults(qc, sync);

  await enqueueFailedMutation({
    key: SYNC_WORKOUT_KEY,
    variables: { sessionId: 's1' },
    label: 'Тренировка',
  });

  renderWith(qc);

  // Badge with the count appears; open the panel.
  await waitFor(() => expect(screen.getByLabelText('Не синхронизировано')).toBeInTheDocument());
  fireEvent.click(screen.getByLabelText('Не синхронизировано'));
  expect(screen.getByText('Тренировка')).toBeInTheDocument();

  // Retry re-runs the SAME mutation with the persisted variables.
  fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
  await waitFor(() => expect(sync).toHaveBeenCalledWith({ sessionId: 's1' }));

  // On success the entry is removed and the whole indicator unmounts.
  await waitFor(() =>
    expect(screen.queryByLabelText('Не синхронизировано')).not.toBeInTheDocument(),
  );
});

it('renders nothing when there are no failed mutations', () => {
  const qc = new QueryClient();
  renderWith(qc);
  expect(screen.queryByLabelText('Не синхронизировано')).not.toBeInTheDocument();
});

it('disables retry while offline (Minor-4)', async () => {
  networkState.isOffline = true;
  const qc = new QueryClient();
  registerWorkoutMutationDefaults(qc, vi.fn());
  await enqueueFailedMutation({
    key: SYNC_WORKOUT_KEY,
    variables: { sessionId: 's1' },
    label: 'Тренировка',
  });

  renderWith(qc);
  await waitFor(() => expect(screen.getByLabelText('Не синхронизировано')).toBeInTheDocument());
  fireEvent.click(screen.getByLabelText('Не синхронизировано'));

  expect(screen.getByRole('button', { name: 'Повторить' })).toBeDisabled();
});

it('removes a stranded entry via the delete button (MAJOR-2a)', async () => {
  const qc = new QueryClient();
  registerWorkoutMutationDefaults(qc, vi.fn());
  await enqueueFailedMutation({
    key: SYNC_WORKOUT_KEY,
    variables: { sessionId: 's1' },
    label: 'Тренировка',
  });

  renderWith(qc);
  await waitFor(() => expect(screen.getByLabelText('Не синхронизировано')).toBeInTheDocument());
  fireEvent.click(screen.getByLabelText('Не синхронизировано'));

  fireEvent.click(screen.getByLabelText('Удалить: Тренировка'));

  // The entry is gone and the whole indicator unmounts (nothing left to show).
  await waitFor(() =>
    expect(screen.queryByLabelText('Не синхронизировано')).not.toBeInTheDocument(),
  );
});
