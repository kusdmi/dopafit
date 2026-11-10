import { AppFrame } from '@/shared/ui/primitives';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import type { components } from '@/shared/api/schema';
import { server } from '@/app/mocks/server';

import { EventEditForm } from './EventEditForm';

type EventOut = components['schemas']['EventOut'];

const networkStatus = { isOnline: true, isOffline: false };
vi.mock('@/shared/lib/network/useNetworkStatus', () => ({
  useNetworkStatus: () => networkStatus,
}));

afterEach(() => {
  networkStatus.isOnline = true;
  networkStatus.isOffline = false;
});

// Matches a seeded event in the calendar MSW store so the PUT resolves 200.
const personalEvent: EventOut = {
  id: 'event-personal-1',
  owner_name: 'Вы',
  program_id: null,
  program_name: null,
  date: '2026-06-20',
  time: '09:00:00',
  type: 'personal',
  status: 'planned',
  workout_session_id: null,
  clients: [],
};

function renderForm(role: 'trainer' | 'client', onSubmitted = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <AppFrame>
        <EventEditForm
          event={personalEvent}
          role={role}
          onClose={() => {}}
          onSubmitted={onSubmitted}
        />
      </AppFrame>
    </QueryClientProvider>,
  );
  return onSubmitted;
}

it('prefills the time from the event (HH:MM)', () => {
  renderForm('client');
  const timeInput = screen.getByLabelText('Время') as HTMLInputElement;
  expect(timeInput.value).toBe('09:00');
  expect((screen.getByLabelText('Дата') as HTMLInputElement).value).toBe(personalEvent.date);
});

it('submits the edited time via PUT (happy path)', async () => {
  const puts: { path: string; body: unknown }[] = [];
  const onRequest = async ({ request }: { request: Request }) => {
    const url = new URL(request.url);
    if (request.method === 'PUT' && url.pathname.includes('/api/v1/calendar/events/')) {
      puts.push({ path: url.pathname, body: await request.clone().json() });
    }
  };
  server.events.on('request:start', onRequest);
  try {
    const onSubmitted = renderForm('client');
    fireEvent.change(screen.getByLabelText('Время'), { target: { value: '10:30' } });
    fireEvent.click(screen.getByText('Сохранить'));

    await waitFor(() => expect(onSubmitted).toHaveBeenCalledTimes(1));
    expect(puts).toHaveLength(1);
    expect(puts[0].path).toContain(personalEvent.id);
    expect(puts[0].body).toMatchObject({ date: personalEvent.date, time: '10:30', program_id: null });
  } finally {
    server.events.removeListener('request:start', onRequest);
  }
});

it('submits a moved date via PUT', async () => {
  const puts: unknown[] = [];
  const onRequest = async ({ request }: { request: Request }) => {
    if (request.method === 'PUT' && new URL(request.url).pathname.includes('/api/v1/calendar/events/')) {
      puts.push(await request.clone().json());
    }
  };
  server.events.on('request:start', onRequest);
  try {
    const onSubmitted = renderForm('trainer');
    fireEvent.change(screen.getByLabelText('Дата'), { target: { value: '2026-06-23' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(onSubmitted).toHaveBeenCalledTimes(1));
    expect(puts).toHaveLength(1);
    expect(puts[0]).toMatchObject({ date: '2026-06-23', time: '09:00', client_ids: [] });
  } finally {
    server.events.removeListener('request:start', onRequest);
  }
});

it('disables the submit button when offline', () => {
  networkStatus.isOnline = false;
  networkStatus.isOffline = true;
  renderForm('client');
  expect(screen.getByRole('button', { name: 'Недоступно офлайн' })).toBeDisabled();
});
