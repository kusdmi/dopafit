import { programKey } from '@/entities/program/api/use-program';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/entities/session/model/store';
import { resetNetworkStatusForTests } from '@/shared/lib/network/useNetworkStatus';
import { program } from '@/shared/config/paths';
import { ProgramDetailPage } from './ProgramDetailPage';
function renderAt(
  id: string,
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[program(id)]}>
        <Routes>
          <Route
            path={program(':id')}
            element={
              <>
                <ProgramDetailPage />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
afterEach(() => {
  useSessionStore.setState({ user: null, isAuthenticated: false });
  vi.restoreAllMocks();
  resetNetworkStatusForTests();
});
describe('ProgramDetailPage', () => {
  it('renders a standard program with its day', async () => {
    renderAt('std-strength');
    // The program name is only in PageTitle (not rendered as a DOM heading in jsdom).
    // Assert that program content loaded by checking the first day is visible.
    await waitFor(() => expect(screen.getByText('День 1')).toBeInTheDocument());
  });
  it('hides the share button on a standard program even for a trainer', async () => {
    // Sharing a standard program is meaningless — clients already see all standard
    // programs, and the backend rejects /share for non-owned programs with 404.
    useSessionStore.setState({
      user: { id: 't1', role: 'trainer' } as never,
      isAuthenticated: true,
    });
    renderAt('std-strength');
    // Wait for program content to load (PageTitle is not a DOM heading in jsdom).
    await waitFor(() => expect(screen.getByText('Начать тренировку')).toBeInTheDocument());
    expect(screen.queryByText('Поделиться программой с клиентом')).not.toBeInTheDocument();
  });
  it('shows a delete button on a non-standard program for a trainer', async () => {
    useSessionStore.setState({
      user: { id: 't1', role: 'trainer' } as never,
      isAuthenticated: true,
    });
    const { api } = await import('@/shared/api/client');
    const created = await api.POST('/api/v1/programs', {
      body: { name: 'Моя прога', kind: 'custom', days: [] },
    });
    const pid = created.data!.id;
    renderAt(pid);
    // PageTitle is not a DOM heading in jsdom; wait for the delete button which is
    // the key assertion for this test (non-standard program → delete visible).
    await waitFor(() => expect(screen.getByText('Удалить программу')).toBeInTheDocument());
  });
  it('disables program deletion while offline (delete is not outbox-backed)', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    resetNetworkStatusForTests();
    useSessionStore.setState({
      user: { id: 't1', role: 'trainer' } as never,
      isAuthenticated: true,
    });
    const { api } = await import('@/shared/api/client');
    const created = await api.POST('/api/v1/programs', {
      body: { name: 'Офлайн прога', kind: 'custom', days: [] },
    });
    const qc = new QueryClient();
    qc.setQueryData(programKey(created.data!.id), created.data);
    renderAt(created.data!.id, qc);
    const deleteButton = await screen.findByText('Удалить программу');
    expect(deleteButton).toBeDisabled();
    expect(screen.getByText('Удаление доступно только онлайн')).toBeInTheDocument();
  });
  it('does not show delete on a standard program', async () => {
    useSessionStore.setState({
      user: { id: 't1', role: 'trainer' } as never,
      isAuthenticated: true,
    });
    renderAt('std-strength');
    // PageTitle is not a DOM heading in jsdom; wait for program content to load.
    await waitFor(() => expect(screen.getByText('Начать тренировку')).toBeInTheDocument());
    expect(screen.queryByText('Удалить программу')).not.toBeInTheDocument();
  });
  it('shows the source trainer on a shared program', async () => {
    const { api } = await import('@/shared/api/client');
    const source = await api.POST('/api/v1/programs', {
      body: { name: 'Силовая тренера', kind: 'custom', days: [] },
    });
    const shared = await api.POST('/api/v1/programs/{program_id}/share', {
      params: { path: { program_id: source.data!.id } },
      body: { client_id: globalThis.crypto.randomUUID() },
    });
    renderAt(shared.data!.id);
    expect(await screen.findByText('Тренер')).toBeInTheDocument();
    expect(screen.getByText('Автор:')).toBeInTheDocument();
  });
});
