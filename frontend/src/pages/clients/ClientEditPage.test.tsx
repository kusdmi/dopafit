import { Routes } from 'react-router-dom';
import { AppFrame } from '@/shared/ui/primitives';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route } from 'react-router-dom';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { useSessionStore } from '@/entities/session/model/store';
import { api } from '@/shared/api/client';
import { connectionEdit } from '@/shared/config/paths';
import { ClientEditPage } from './ClientEditPage';
// The page is trainer-only (role guard); authenticate as a trainer.
beforeEach(() => {
    useSessionStore.setState({ user: { id: 't1', role: 'trainer' } as never, isAuthenticated: true });
});
afterEach(() => {
    useSessionStore.setState({ user: null, isAuthenticated: false });
});
function renderEdit(id: string) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={qc}>
      <AppFrame>
        <MemoryRouter initialEntries={[connectionEdit(id)]}>
          <Routes><Route path={connectionEdit(':id')} element={<ClientEditPage />}/></Routes>
        </MemoryRouter>
      </AppFrame>
    </QueryClientProvider>);
}
it('shows "Архивировать" for an active client', async () => {
    renderEdit('client-stub-1');
    await waitFor(() => expect(screen.getByText('Архивировать')).toBeInTheDocument());
});
it('shows the client injuries to the trainer', async () => {
    renderEdit('client-stub-1');
    // For a managed client the injuries are editable in the form textarea (the read-only
    // "Травмы и ограничения" card is only rendered for linked clients).
    const injuriesField = await screen.findByLabelText('Ограничения по здоровью');
    expect(injuriesField).toHaveValue('Грыжа L4-L5, ограничение по осевой нагрузке');
    expect(screen.queryByText('Травмы и ограничения')).not.toBeInTheDocument();
});
it('shows "Не указано" when the client has no injuries', async () => {
    renderEdit('client-linked-1');
    await waitFor(() => expect(screen.getByText('Травмы и ограничения')).toBeInTheDocument());
    expect(screen.getByText('Не указано')).toBeInTheDocument();
});
it('shows "Разархивировать" after archiving', async () => {
    await api.POST('/api/v1/clients/{client_id}/archive', {
        params: { path: { client_id: 'client-stub-1' } },
    });
    renderEdit('client-stub-1');
    await waitFor(() => expect(screen.getByText('Разархивировать')).toBeInTheDocument());
});
it('shows "Отправить запрос снова" and hides status actions for an unlinked client', async () => {
    await api.POST('/api/v1/clients/{client_id}/unlink', {
        params: { path: { client_id: 'client-linked-1' } },
    });
    renderEdit('client-linked-1');
    await waitFor(() => expect(screen.getByText('Отправить запрос снова')).toBeInTheDocument());
    expect(screen.queryByText('Отвязать клиента')).not.toBeInTheDocument();
    expect(screen.queryByText('Архивировать')).not.toBeInTheDocument();
});
it('saves injuries and note together for a managed client', async () => {
    renderEdit('client-stub-1');
    const noteField = await screen.findByLabelText('Примечание тренера');
    fireEvent.change(noteField, { target: { value: 'Новая заметка' } });
    fireEvent.change(screen.getByLabelText('Ограничения по здоровью'), {
        target: { value: 'Грыжа обновлена' },
    });
    fireEvent.click(screen.getByText('Сохранить изменения'));
    await waitFor(async () => {
        const { data } = await api.GET('/api/v1/clients/{client_id}', {
            params: { path: { client_id: 'client-stub-1' } },
        });
        expect(data?.note).toBe('Новая заметка');
        expect(data?.injuries).toBe('Грыжа обновлена');
    });
});
it('lets the trainer edit note for a LINKED client', async () => {
    renderEdit('client-linked-1');
    const noteField = await screen.findByLabelText('Примечание тренера');
    fireEvent.change(noteField, { target: { value: 'Заметка по залинкованному' } });
    fireEvent.click(screen.getByText('Сохранить изменения'));
    await waitFor(async () => {
        const { data } = await api.GET('/api/v1/clients/{client_id}', {
            params: { path: { client_id: 'client-linked-1' } },
        });
        expect(data?.note).toBe('Заметка по залинкованному');
    });
});
