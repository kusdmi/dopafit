import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { useSessionStore } from '@/entities/session/model/store';
import { env } from '@/shared/config/env';
import { paths } from '@/shared/config/paths';
import { server } from '@/app/mocks/server';
import { mockAuthResponse } from '@/shared/test/factories';

import { AppRoutes } from '@/app/router';

async function signIn() {
  await useSessionStore
    .getState()
    .setSession(mockAuthResponse({ email: 'client@dopafit.dev', phone: '+79990000001' }));
}

function renderRoute(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  window.history.pushState({}, '', path);
  return render(
    <QueryClientProvider client={queryClient}>
      <AppRoutes />
    </QueryClientProvider>,
  );
}

const SETTINGS = {
  push_enabled: true,
  workout_reminders: true,
  measurement_reminders: true,
  progress_updates: true,
  weekly_reports: false,
  motivational: true,
  new_features: false,
};

describe('notification settings screen', () => {
  beforeEach(async () => {
    await useSessionStore.getState().clearSession();
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
  });

  it('reflects GET values and shows the category section when push is enabled', async () => {
    server.use(
      http.get(`${env.apiUrl}/api/v1/notifications/settings`, () => HttpResponse.json(SETTINGS)),
    );

    await signIn();
    renderRoute(paths.settingsNotifications);

    expect(await screen.findByText('Пуш-уведомления')).toBeInTheDocument();
    // Category section is visible because push_enabled is true.
    expect(await screen.findByText('Типы уведомлений')).toBeInTheDocument();

    // Master toggle reflects push_enabled = true.
    const master = await screen.findByLabelText('Все уведомления');
    expect((master as HTMLInputElement).checked).toBe(true);

    // weekly_reports = false reflects in its toggle.
    const weekly = screen.getByLabelText('Еженедельные отчёты');
    expect((weekly as HTMLInputElement).checked).toBe(false);
  });

  it('fires PATCH with the toggled category field', async () => {
    let received: Record<string, unknown> | null = null;
    server.use(
      http.get(`${env.apiUrl}/api/v1/notifications/settings`, () => HttpResponse.json(SETTINGS)),
      http.patch(`${env.apiUrl}/api/v1/notifications/settings`, async ({ request }) => {
        received = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...SETTINGS, ...received });
      }),
    );

    await signIn();
    renderRoute(paths.settingsNotifications);

    const weekly = await screen.findByLabelText('Еженедельные отчёты');
    fireEvent.click(weekly);

    await waitFor(() => {
      expect(received).not.toBeNull();
      expect(received).toEqual({ weekly_reports: true });
    });
  });

  it('hides the category section and shows a hint when push is disabled', async () => {
    server.use(
      http.get(`${env.apiUrl}/api/v1/notifications/settings`, () =>
        HttpResponse.json({ ...SETTINGS, push_enabled: false }),
      ),
    );

    await signIn();
    renderRoute(paths.settingsNotifications);

    expect(await screen.findByText(/Включите уведомления, чтобы не пропустить/)).toBeInTheDocument();
    expect(screen.queryByText('Типы уведомлений')).toBeNull();
    expect(screen.queryByLabelText('Еженедельные отчёты')).toBeNull();
  });
});
