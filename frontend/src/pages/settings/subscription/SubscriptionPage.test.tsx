import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { AppRoutes } from '@/app/router';
import { useSessionStore } from '@/entities/session/model/store';
import { setMockSubscription } from '@/entities/subscription/api/mocks';
import { mockAuthResponse } from '@/shared/test/factories';
import { paths } from '@/shared/config/paths';
import { env } from '@/shared/config/env';
import { server } from '@/app/mocks/server';
import { trackMetrikaGoal } from '@/shared/lib/telemetry/metrika';
vi.mock('@/shared/lib/telemetry/metrika', () => ({
  trackMetrikaGoal: vi.fn(),
  trackMetrikaContext: vi.fn(),
  trackMetrikaPage: vi.fn(),
}));
function renderRoute(path: string = paths.settingsSubscription) {
  window.history.pushState({}, '', path);
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AppRoutes />
    </QueryClientProvider>,
  );
}
beforeEach(async () => {
  vi.clearAllMocks();
  await useSessionStore.getState().setSession(mockAuthResponse());
});
describe('free Premium launch', () => {
  it('activates without prices or gifts and keeps access after reopening', async () => {
    const view = renderRoute();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Подключить Premium бесплатно' }),
    );
    expect(await screen.findByText('Premium подключён')).toBeInTheDocument();
    expect(trackMetrikaGoal).toHaveBeenCalledExactlyOnceWith('premium_activated');
    expect(screen.queryByText(/тестового запуска/)).not.toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.queryByText(/₽/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Подарить|Продлить|Подключить/ }),
    ).not.toBeInTheDocument();
    view.unmount();
    renderRoute();
    expect(await screen.findByText('Premium подключён')).toBeInTheDocument();
    expect(trackMetrikaGoal).toHaveBeenCalledTimes(1);
  });
  it('preserves the ordinary term and offers free access', async () => {
    setMockSubscription({ is_active: true, ends_at: '2099-12-31T00:00:00Z' });
    renderRoute();
    expect(await screen.findByText('Действует до 31 декабря 2099')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Подключить Premium бесплатно' }),
    ).toBeInTheDocument();
  });
  it('shows an activation error and allows retry', async () => {
    server.use(
      http.post(
        `${env.apiUrl}/api/v1/subscriptions/activate`,
        () => HttpResponse.json({}, { status: 500 }),
        { once: true },
      ),
    );
    renderRoute();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Подключить Premium бесплатно' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось подключить Premium');
    expect(trackMetrikaGoal).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Подключить Premium бесплатно' }));
    expect(await screen.findByText('Premium подключён')).toBeInTheDocument();
    expect(trackMetrikaGoal).toHaveBeenCalledExactlyOnceWith('premium_activated');
  });
  it('redirects the legacy payment URL to Premium', async () => {
    renderRoute(`${paths.subscriptionCheckout}?payment_id=mock_example`);
    expect(
      await screen.findByRole('button', { name: 'Подключить Premium бесплатно' }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe(paths.settingsSubscription);
  });
});
