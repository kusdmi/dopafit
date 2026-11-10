import { Routes } from 'react-router-dom';
import { AppFrame } from '@/shared/ui/primitives';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { MemoryRouter, Route } from 'react-router-dom';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { useSessionStore } from '@/entities/session/model/store';
import { server } from '@/app/mocks/server';
import { env } from '@/shared/config/env';
import { connectionMeasurements } from '@/shared/config/paths';
import { clientMeasurementsKey } from '@/entities/measurement/api/use-client-measurements';
import { ClientMeasurementsPage } from './ClientMeasurementsPage';
// Trainer-only page (role guard).
beforeEach(() => {
  useSessionStore.setState({ user: { id: 't1', role: 'trainer' } as never, isAuthenticated: true });
});
afterEach(() => {
  useSessionStore.setState({ user: null, isAuthenticated: false });
});
function renderPage(
  id: string,
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  return render(
    <QueryClientProvider client={qc}>
      <AppFrame>
        <MemoryRouter initialEntries={[connectionMeasurements(id)]}>
          <Routes>
            <Route path={connectionMeasurements(':id')} element={<ClientMeasurementsPage />} />
          </Routes>
        </MemoryRouter>
      </AppFrame>
    </QueryClientProvider>,
  );
}
it('lists the client measurements and expands to values (custom included, no photos)', async () => {
  let requestedClientId: string | null = null;
  server.use(
    http.get(`${env.apiUrl}/api/v1/measurements`, ({ request }) => {
      requestedClientId = new URL(request.url).searchParams.get('client_id');
      return HttpResponse.json({
        items: [
          {
            id: 'm1',
            date: '2026-06-20',
            weight: 80,
            waist: 88,
            custom_values: [{ slot: 1, name: 'Жир %', unit: '%', value: 16 }],
            // The backend returns photos private/empty for a trainer; the page must
            // not render a photo section regardless.
            photos: [],
          },
        ],
        total: 1,
      });
    }),
  );
  renderPage('client-linked-1');
  // The row carries the whole date in its accessible name (the visible date is
  // split into year/day), and the headline metrics render as labelled columns —
  // the same shape as the client-facing measurements screen.
  const row = await screen.findByRole('button', { name: 'Замер за 20 июн. 2026' });
  expect(row).toHaveTextContent('Вес');
  expect(row).toHaveTextContent('80 кг');
  expect(row).toHaveTextContent('Талия');
  expect(row).toHaveTextContent('88 см');
  // Scoped to the client card UUID from the route.
  expect(requestedClientId).toBe('client-linked-1');
  // Expand the row to reveal detail with the custom field.
  fireEvent.click(row);
  await waitFor(() => expect(screen.getByText('Жир %')).toBeInTheDocument());
  expect(screen.getByText('16 %')).toBeInTheDocument();
  // No photo section is rendered.
  expect(screen.queryByText('Фотографии')).not.toBeInTheDocument();
});
it('falls back to whatever the record has when no headline metric is present', async () => {
  server.use(
    http.get(`${env.apiUrl}/api/v1/measurements`, () =>
      HttpResponse.json({
        items: [
          {
            id: 'm1',
            date: '2026-06-20',
            custom_values: [{ slot: 1, name: 'Бицепс', unit: 'см', value: 37.5 }],
            photos: [],
          },
        ],
        total: 1,
      }),
    ),
  );
  renderPage('client-linked-1');
  // Without the fallback the collapsed row would be blank even though the
  // record holds data — that reads as data loss.
  const row = await screen.findByRole('button', { name: 'Замер за 20 июн. 2026' });
  expect(row).toHaveTextContent('Бицепс');
  expect(row).toHaveTextContent('37.5 см');
});
it('shows an empty state when the client has no measurements', async () => {
  server.use(
    http.get(`${env.apiUrl}/api/v1/measurements`, () => HttpResponse.json({ items: [], total: 0 })),
  );
  renderPage('client-linked-1');
  await waitFor(() => expect(screen.getByText('Нет записей')).toBeInTheDocument());
});

it('does not expose cached measurements after the client revokes access', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(clientMeasurementsKey('client-linked-1'), {
    items: [{ id: 'm1', date: '2026-06-20', weight: 80, photos: [] }],
    total: 1,
  });
  server.use(
    http.get(`${env.apiUrl}/api/v1/measurements`, () =>
      HttpResponse.json({ code: 'not_found', message: 'Client not found' }, { status: 404 }),
    ),
  );

  renderPage('client-linked-1', qc);
  expect(screen.queryByText('80 кг')).not.toBeInTheDocument();
  expect(await screen.findByText('Не удалось загрузить замеры клиента')).toBeInTheDocument();
  expect(screen.queryByText('80 кг')).not.toBeInTheDocument();
});
