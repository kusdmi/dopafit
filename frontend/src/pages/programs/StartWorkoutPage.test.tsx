import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { useSessionStore } from '@/entities/session/model/store';
import { useWorkoutStore } from '@/entities/workout/model/store';
import { programSession, programStart } from '@/shared/config/paths';
import { StartWorkoutPage } from './StartWorkoutPage';
const currentPath = { value: '' };
function LocationProbe() {
    const { pathname } = useLocation();
    useEffect(() => {
        currentPath.value = pathname;
    }, [pathname]);
    return null;
}
function renderAt(id: string) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    currentPath.value = programStart(id);
    return render(<QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[programStart(id)]}>
        <LocationProbe />
        <Routes>
          <Route path={programStart(':id')} element={<>
            <StartWorkoutPage />
          </>}/>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>);
}
afterEach(() => {
    useSessionStore.setState({ user: null, isAuthenticated: false });
    useWorkoutStore.getState().reset();
});
describe('StartWorkoutPage', () => {
    it('enables Start only after a day is selected', async () => {
        renderAt('std-strength');
        await waitFor(() => expect(screen.getByText('День 1')).toBeInTheDocument());
        expect(screen.getByRole('button', { name: 'Старт' })).toBeDisabled();
        await userEvent.click(screen.getByText('День 1'));
        expect(screen.getByRole('button', { name: 'Старт' })).toBeEnabled();
    });
    it('shows the participant step for a trainer', async () => {
        useSessionStore.setState({ user: { id: 't1', role: 'trainer' } as never, isAuthenticated: true });
        renderAt('std-strength');
        await waitFor(() => expect(screen.getByText('Кто тренируется?')).toBeInTheDocument());
    });
    it('does not show the participant step for a client', async () => {
        useSessionStore.setState({ user: { id: 'c1', role: 'client' } as never, isAuthenticated: true });
        renderAt('std-strength');
        await waitFor(() => expect(screen.getByText('День 1')).toBeInTheDocument());
        expect(screen.queryByText('Кто тренируется?')).not.toBeInTheDocument();
    });
    // B005: starting a second self-session while one is already active on ANOTHER
    // program must warn instead of silently creating an empty second session.
    it('warns and does not create a second session when one is active on another program', async () => {
        useSessionStore.setState({ user: { id: 'c1', role: 'client' } as never, isAuthenticated: true });
        useWorkoutStore.getState().startSession({
            participant: { kind: 'self' },
            programId: 'other-prog',
            dayId: 'd0',
            slots: [{ slotId: 's0', variantId: 'v0', name: 'Тяга', sets: 3, reps: 10, alternatives: [] }],
        });
        renderAt('std-strength');
        await waitFor(() => expect(screen.getByText('День 1')).toBeInTheDocument());
        await userEvent.click(screen.getByText('День 1'));
        await userEvent.click(screen.getByRole('button', { name: 'Старт' }));
        // The busy dialog appears; no second session was created and we did not
        // navigate to the new program's session screen.
        expect(await screen.findByText('Тренировка уже идёт')).toBeInTheDocument();
        expect(Object.keys(useWorkoutStore.getState().sessions)).toEqual(['self']);
        expect(useWorkoutStore.getState().sessions.self.programId).toBe('other-prog');
        expect(currentPath.value).toBe(programStart('std-strength'));
        // Confirming routes to the ALREADY-active session, not a new one.
        await userEvent.click(screen.getByRole('button', { name: 'К текущей' }));
        await waitFor(() => expect(currentPath.value).toBe(programSession('other-prog')));
    });
});
