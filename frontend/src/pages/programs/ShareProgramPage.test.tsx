import { Routes } from 'react-router-dom';
import { AppFrame } from '@/shared/ui/primitives';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { Route, MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/entities/session/model/store';
import { programShare } from '@/shared/config/paths';
import { ShareProgramPage } from './ShareProgramPage';
// Offline forcing is opt-in per test via this mock; default stays online.
const networkStatus = { isOnline: true, isOffline: false };
vi.mock('@/shared/lib/network/useNetworkStatus', () => ({
    useNetworkStatus: () => networkStatus,
}));
// The page is trainer-only (role guard); authenticate as a trainer.
beforeEach(() => {
    useSessionStore.setState({ user: { id: 't1', role: 'trainer' } as never, isAuthenticated: true });
});
afterEach(() => {
    networkStatus.isOnline = true;
    networkStatus.isOffline = false;
    useSessionStore.setState({ user: null, isAuthenticated: false });
});
function renderPage() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={qc}>
      <AppFrame>
        <MemoryRouter initialEntries={[programShare('std-strength')]}>
          <Routes><Route path={programShare(':id')} element={<ShareProgramPage />}/></Routes>
        </MemoryRouter>
      </AppFrame>
    </QueryClientProvider>);
}
it('renders the active client and the copy button', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Анна Клиентова')).toBeInTheDocument());
    expect(screen.getByText('Скопировать')).toBeInTheDocument();
});
it('disables the copy button when offline', async () => {
    networkStatus.isOnline = false;
    networkStatus.isOffline = true;
    renderPage();
    await waitFor(() => expect(screen.getByText('Недоступно офлайн')).toBeInTheDocument());
    expect(screen.getByText('Недоступно офлайн').closest('button')).toBeDisabled();
});
