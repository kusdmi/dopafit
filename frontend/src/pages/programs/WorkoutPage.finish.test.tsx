import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useWorkoutStore } from '@/entities/workout/model/store';
import { sessionKeyFor } from '@/entities/workout/model/types';

import { WorkoutPage } from './WorkoutPage';

// Drive the offline branch so finish + navigation happen deterministically/synchronously.
const networkStatus = { isOnline: false, isOffline: true };
vi.mock('@/shared/lib/network/useNetworkStatus', () => ({
  useNetworkStatus: () => networkStatus,
}));

// Mount WorkoutPage on a route that stays matched regardless of where the
// finish handler navigates. This keeps the page (and its FinishDialog) mounted
// after confirm, so the dialog's visibility reflects ONLY finishOpen — not the
// route unmounting. With this harness the lingering-dialog bug is observable.
function wrapAlwaysMounted() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/workout']}>
        <WorkoutPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('WorkoutPage — finish dialog with multiple sessions', () => {
  beforeEach(() => {
    networkStatus.isOnline = false;
    networkStatus.isOffline = true;
    useWorkoutStore.getState().reset();
  });

  it('closes the finish dialog after confirming when another session remains', async () => {
    const slots = [
      { slotId: 'sl1', variantId: 'v1', name: 'Жим лёжа', sets: 3, reps: 10, alternatives: [] },
    ];
    // Self session + one client session running in parallel.
    useWorkoutStore.getState().startSession({
      participant: { kind: 'self' },
      programId: 'p1',
      dayId: 'd1',
      slots,
    });
    useWorkoutStore.getState().startSession({
      participant: { kind: 'client', clientId: 'client-stub-1', clientName: 'Вася' },
      programId: 'p1',
      dayId: 'd1',
      slots,
    });
    // Finish the self session; the client session stays.
    useWorkoutStore.getState().switchTo(sessionKeyFor({ kind: 'self' }));
    const remainingKey = sessionKeyFor({
      kind: 'client',
      clientId: 'client-stub-1',
      clientName: 'Вася',
    });

    wrapAlwaysMounted();

    await userEvent.click(screen.getByRole('button', { name: 'Завершить тренировку' }));
    await userEvent.click(screen.getByRole('button', { name: 'Завершить' }));

    // The dialog must be gone — it must not linger over the remaining session.
    await waitFor(() =>
      expect(screen.queryByText('Завершить тренировку?')).not.toBeInTheDocument(),
    );
    // The remaining client session is now active.
    expect(useWorkoutStore.getState().activeKey).toBe(remainingKey);
  });
});
