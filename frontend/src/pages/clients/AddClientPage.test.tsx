import { Routes } from 'react-router-dom';
import { AppFrame } from '@/shared/ui/primitives';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { useSessionStore } from '@/entities/session/model/store';
import { paths } from '@/shared/config/paths';
import { AddClientPage } from './AddClientPage';
// The page is trainer-only (role guard); authenticate as a trainer.
beforeEach(() => {
    useSessionStore.setState({ user: { id: 't1', role: 'trainer' } as never, isAuthenticated: true });
});
afterEach(() => {
    useSessionStore.setState({ user: null, isAuthenticated: false });
});
function LocationProbe() {
    const location = useLocation();
    return <div data-testid="location">{location.pathname}</div>;
}
it('creates a stub client from the form', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // Тост в jsdom не рендерит message в DOM, поэтому
    // успех проверяем по навигации на /app/settings/connections после создания клиента.
    render(<QueryClientProvider client={qc}>
      <AppFrame>
        <MemoryRouter initialEntries={[paths.connectionAdd]}>
          <Routes><Route path={paths.connectionAdd} element={<AddClientPage />}/></Routes>
          <LocationProbe />
        </MemoryRouter>
      </AppFrame>
    </QueryClientProvider>);
    const nameInput = await screen.findByLabelText('Имя клиента');
    fireEvent.input(nameInput, { target: { value: 'Новый клиент' } });
    fireEvent.click(screen.getByText('Создать профиль'));
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe(paths.connections));
});
it('redirects a non-trainer away from the trainer-only page', async () => {
    useSessionStore.setState({ user: { id: 'c1', role: 'client' } as never, isAuthenticated: true });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}>
      <AppFrame>
        <MemoryRouter initialEntries={[paths.connectionAdd]}>
          <Routes><Route path={paths.connectionAdd} element={<AddClientPage />}/></Routes>
          <LocationProbe />
        </MemoryRouter>
      </AppFrame>
    </QueryClientProvider>);
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe(paths.connections));
    expect(screen.queryByLabelText('Имя клиента')).not.toBeInTheDocument();
});
it('submits injuries and note for a new client', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}>
      <AppFrame>
        <MemoryRouter initialEntries={[paths.connectionAdd]}>
          <Routes><Route path={paths.connectionAdd} element={<AddClientPage />}/></Routes>
          <LocationProbe />
        </MemoryRouter>
      </AppFrame>
    </QueryClientProvider>);
    fireEvent.input(await screen.findByLabelText('Имя клиента'), { target: { value: 'Олег' } });
    fireEvent.input(screen.getByLabelText('Ограничения по здоровью'), {
        target: { value: 'Гипертония' },
    });
    fireEvent.input(screen.getByLabelText('Примечание тренера'), {
        target: { value: 'Утренние тренировки' },
    });
    fireEvent.click(screen.getByText('Создать профиль'));
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe(paths.connections));
});
