import { AppFrame } from '@/shared/ui/primitives';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { useSessionStore } from '@/entities/session/model/store';
import { server } from '@/app/mocks/server';

import { EventBookingModal } from './EventBookingModal';

const networkStatus = { isOnline: true, isOffline: false };
vi.mock('@/shared/lib/network/useNetworkStatus', () => ({
  useNetworkStatus: () => networkStatus,
}));

afterEach(() => {
  networkStatus.isOnline = true;
  networkStatus.isOffline = false;
});

function renderModal(role: 'trainer' | 'client', onSubmitted = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <AppFrame>
        <EventBookingModal
          isOpen
          date="2026-06-20"
          role={role}
          onClose={() => {}}
          onSubmitted={onSubmitted}
        />
      </AppFrame>
    </QueryClientProvider>,
  );
  return onSubmitted;
}

// Дата в форму не входит — её задаёт выбранный день календаря, — поэтому по
// макету 392:4474 это статичная плашка, а не `readOnly`-инпут: такой инпут
// скринридер объявил бы полем, в которое нельзя писать, хотя писать туда и не
// предполагалось. Значение при этом обязано остаться видимым.
it('shows the date as static text, not as a disabled input', () => {
  renderModal('client');
  expect(screen.getByText('20 июня 2026')).toBeInTheDocument();
  expect(screen.queryByLabelText('Дата')).not.toBeInTheDocument();
});

// Время редактируется, поэтому остаётся настоящим полем со своей подписью.
it('keeps the time an editable labelled field', () => {
  renderModal('client');
  const time = screen.getByLabelText('Время') as HTMLInputElement;
  expect(time.type).toBe('time');
  expect(time).not.toHaveAttribute('readonly');
});

it('shows a validation error and does not submit without time', async () => {
  const onSubmitted = renderModal('client');
  fireEvent.click(screen.getByText('Записать'));
  await waitFor(() => expect(screen.getByText('Укажите время')).toBeInTheDocument());
  expect(onSubmitted).not.toHaveBeenCalled();
});

it('submits with time and a selected client for a trainer', async () => {
  useSessionStore.setState({ user: { id: 'u1', role: 'trainer' } as never, isAuthenticated: true });
  const onSubmitted = renderModal('trainer');
  await waitFor(() => expect(screen.getByText('Вася')).toBeInTheDocument());

  fireEvent.change(screen.getByLabelText('Время'), { target: { value: '10:30' } });
  fireEvent.click(screen.getByText('Вася'));
  fireEvent.click(screen.getByText('Записать'));

  await waitFor(() => expect(onSubmitted).toHaveBeenCalledTimes(1));
});

it('sends the selected program with the booking', async () => {
  const posted: unknown[] = [];
  const onRequest = async ({ request }: { request: Request }) => {
    if (request.method === 'POST' && new URL(request.url).pathname.endsWith('/api/v1/calendar/events')) {
      posted.push(await request.clone().json());
    }
  };
  server.events.on('request:start', onRequest);
  try {
    const onSubmitted = renderModal('trainer');
    const program = screen.getByRole('combobox', { name: 'Программа тренировки' });
    await waitFor(() => expect(screen.getByRole('option', { name: 'Силовая' })).toBeInTheDocument());
    fireEvent.change(program, { target: { value: 'std-strength' } });
    fireEvent.change(screen.getByLabelText('Время'), { target: { value: '18:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Записать' }));

    await waitFor(() => expect(onSubmitted).toHaveBeenCalledTimes(1));
    expect(posted).toMatchObject([{ program_id: 'std-strength', date: '2026-06-20', time: '18:00' }]);
  } finally {
    server.events.removeListener('request:start', onRequest);
  }
});

it('hides the clients section for a client role', () => {
  renderModal('client');
  expect(screen.queryByText('Клиенты')).not.toBeInTheDocument();
});

it('does not request GET /clients for a client role', async () => {
  const clientsRequests: string[] = [];
  const onRequest = ({ request }: { request: Request }) => {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname.endsWith('/api/v1/clients')) {
      clientsRequests.push(url.pathname);
    }
  };
  server.events.on('request:start', onRequest);
  try {
    renderModal('client');
    // Give react-query a tick; an enabled query would have fired by now.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(clientsRequests).toHaveLength(0);
  } finally {
    server.events.removeListener('request:start', onRequest);
  }
});

it('disables Записать when offline', () => {
  networkStatus.isOnline = false;
  networkStatus.isOffline = true;
  renderModal('client');
  const button = screen.getByRole('button', { name: 'Недоступно офлайн' });
  expect(button).toBeDisabled();
});
