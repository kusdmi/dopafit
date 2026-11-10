import { Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkoutStore } from '@/entities/workout/model/store';
import { WorkoutPage } from './WorkoutPage';
vi.mock('@/shared/lib/network/useNetworkStatus', () => ({
    useNetworkStatus: () => ({ isOnline: true, isOffline: false }),
}));
function seedTwoSessions() {
    useWorkoutStore.getState().reset();
    useWorkoutStore.getState().startSession({
        participant: { kind: 'self' },
        programId: 'p1',
        dayId: 'd1',
        slots: [{ slotId: 'sl1', variantId: 'v1', name: 'Жим лёжа', sets: 3, reps: 10, alternatives: [] }],
    });
    useWorkoutStore.getState().startSession({
        participant: { kind: 'client', clientId: 'c1', clientName: 'Клиент' },
        programId: 'p2',
        dayId: 'd2',
        slots: [{ slotId: 'sl2', variantId: 'v2', name: 'Присед', sets: 3, reps: 8, alternatives: [] }],
    });
}
describe('WorkoutPage URL→store sync gate (B009)', () => {
    beforeEach(() => {
        seedTwoSessions();
    });
    it('only mounts the workout matching the current route', async () => {
      useWorkoutStore.getState().switchTo('self');
      render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={['/app/programs/p1/session']}><Routes><Route path="/app/programs/:id/session" element={<WorkoutPage />} /></Routes></MemoryRouter></QueryClientProvider>);
      await waitFor(() => expect(screen.getByText('Жим лёжа')).toBeInTheDocument());
      expect(screen.queryByText('Присед')).not.toBeInTheDocument();
      expect(useWorkoutStore.getState().activeKey).toBe('self');
    });
    // The active view-item: params AND location both point at p2, so the effect
    // must sync the store to p2. Guards against over-gating that would break the
    // normal deep-link / tab-switch path.
    it('syncs the store when the instance URL matches the current location', async () => {
        useWorkoutStore.getState().switchTo('self');
        render(<QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/app/programs/p2/session']}>
          <Routes><Route path="/app/programs/:id/session" element={<>
            <WorkoutPage />
          </>}/></Routes>
        </MemoryRouter>
      </QueryClientProvider>);
        await waitFor(() => expect(useWorkoutStore.getState().activeKey).toBe('client:c1'));
        expect(screen.getByText('Присед')).toBeInTheDocument();
    });
});
