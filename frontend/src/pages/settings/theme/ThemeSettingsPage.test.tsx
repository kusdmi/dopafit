import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useSessionStore } from '@/entities/session/model/store';
import { server } from '@/app/mocks/server';
import { env } from '@/shared/config/env';

import { ThemeSettingsPage } from './ThemeSettingsPage';

const networkStatus = { isOnline: true, isOffline: false };
vi.mock('@/shared/lib/network/useNetworkStatus', () => ({
  useNetworkStatus: () => networkStatus,
}));

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const ui = (
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ThemeSettingsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { ...render(ui), ui };
}

afterEach(() => {
  networkStatus.isOnline = true;
  networkStatus.isOffline = false;
  useSessionStore.setState({ user: null, isAuthenticated: false });
});

describe('ThemeSettingsPage offline flush', () => {
  it('queues an offline theme choice and saves it to the server on reconnect', async () => {
    useSessionStore.setState({ user: { id: 'u1', role: 'client' } as never, isAuthenticated: true });
    const puts: unknown[] = [];
    server.use(
      http.get(`${env.apiUrl}/api/v1/users/me/settings`, () =>
        HttpResponse.json({ theme: 'system', units: 'metric', analytics_config: null }),
      ),
      http.put(`${env.apiUrl}/api/v1/users/me/settings`, async ({ request }) => {
        const body = await request.json();
        puts.push(body);
        return HttpResponse.json({ theme: (body as { theme: string }).theme });
      }),
    );

    // Go offline before rendering.
    networkStatus.isOnline = false;
    networkStatus.isOffline = true;
    const { rerender, ui } = renderPage();

    await userEvent.click(await screen.findByText('Тёмная'));
    // Offline: no server write yet, honest hint shown.
    expect(puts).toHaveLength(0);
    expect(
      screen.getByText(/Офлайн: тема применена локально/),
    ).toBeInTheDocument();

    // Reconnect: the 'online' event flushes the queued choice to the server once.
    networkStatus.isOnline = true;
    networkStatus.isOffline = false;
    rerender(ui);
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => expect(puts).toEqual([{ theme: 'dark' }]), { timeout: 3000 });
  });

  it('re-arms the pending choice when the flush fails, retrying on the next online event', async () => {
    useSessionStore.setState({ user: { id: 'u1', role: 'client' } as never, isAuthenticated: true });
    let attempts = 0;
    const puts: unknown[] = [];
    server.use(
      http.get(`${env.apiUrl}/api/v1/users/me/settings`, () =>
        HttpResponse.json({ theme: 'system', units: 'metric', analytics_config: null }),
      ),
      http.put(`${env.apiUrl}/api/v1/users/me/settings`, async ({ request }) => {
        attempts += 1;
        const body = await request.json();
        if (attempts === 1) {
          return HttpResponse.json(
            { code: 'server_error', message: 'boom', details: null },
            { status: 500 },
          );
        }
        puts.push(body);
        return HttpResponse.json({ theme: (body as { theme: string }).theme });
      }),
    );

    networkStatus.isOnline = false;
    networkStatus.isOffline = true;
    const { rerender, ui } = renderPage();

    await userEvent.click(await screen.findByText('Тёмная'));

    networkStatus.isOnline = true;
    networkStatus.isOffline = false;
    rerender(ui);

    // First reconnect: the flush hits the server once but fails (500). Its onError
    // re-arms pendingTheme so the choice survives. Wait for the failed attempt to
    // settle; nothing is persisted yet.
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    // Wait for the failed mutation to fully settle: the error alert renders from the
    // same state update that runs onError (which re-arms pendingTheme). Asserting on
    // it avoids racing the retry against the re-arm.
    await screen.findByRole('alert', {}, { timeout: 3000 });
    expect(attempts).toBe(1);
    expect(puts).toHaveLength(0);

    // Second online event: the re-armed choice flushes successfully.
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(puts).toEqual([{ theme: 'dark' }]), { timeout: 3000 });
  });
});
