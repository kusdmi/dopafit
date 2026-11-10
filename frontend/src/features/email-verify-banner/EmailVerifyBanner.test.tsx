import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setMockMe } from '@/entities/user/api/mocks';
import { useSessionStore } from '@/entities/session/model/store';
import { env } from '@/shared/config/env';
import { server } from '@/app/mocks/server';
import { paths } from '@/shared/config/paths';
import { kvPrefs } from '@/shared/lib/platform/storage/kv-prefs';
import { localDateKey } from '@/shared/lib/time/localDateKey';
import { mockAuthResponse } from '@/shared/test/factories';

import { EmailVerifyBanner, LAST_SHOWN_KEY } from './EmailVerifyBanner';

// useToast рендерит всплывающий тост, который в jsdom не проверить напрямую,
// поэтому здесь
// же воспроизводим минимум, который нужен баннеру: Dialog (рендерит children
// по isOpen), ActionButton/Spinner (нативные аналоги для getByRole), и подменяем
// useToast на spy, чтобы проверить показ тоста об успехе.
const present = vi.fn(async () => {});
vi.mock('@/shared/ui/primitives', async (importActual) => {
  const actual = await importActual<typeof import('@/shared/ui/primitives')>();
  const { createElement } = await import('react');
  const ActionButton = ({
    children,
    expand: _expand,
    fill: _fill,
    color: _color,
    routerLink: _routerLink,
    ...rest
  }: Record<string, unknown> & { children?: unknown }) =>
    createElement('button', rest as Record<string, unknown>, children as never);
  const Spinner = ({ name: _name, ...rest }: Record<string, unknown>) =>
    createElement('span', { role: 'progressbar', ...rest });
  const Dialog = ({
    isOpen,
    children,
    onClose: _onClose,
    ...rest
  }: Record<string, unknown> & { children?: unknown; isOpen?: boolean }) =>
    isOpen
      ? createElement('div', { role: 'dialog', ...rest } as Record<string, unknown>, children as never)
      : null;
  return {
    ...actual,
    ActionButton,
    Spinner,
    Dialog,
    useToast: () => [present, vi.fn(async () => {})],
  };
});

const DAY_MS = 86_400_000;
const inDays = (days: number) => new Date(Date.now() + days * DAY_MS).toISOString();

// The banner is route-gated to the tab zone, so tests render it "on"
// /app/home by default; the register-route test overrides the route.
function renderBanner(route: string = paths.home) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <EmailVerifyBanner />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('EmailVerifyBanner', () => {
  beforeEach(async () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
    await useSessionStore.getState().setSession(mockAuthResponse());
    present.mockClear();
  });

  it('opens for an unverified email with the days-left warning', async () => {
    setMockMe({ email_verified: false, verification_deadline_at: inDays(30) });
    renderBanner();

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Подтвердите email')).toBeInTheDocument();
    expect(
      screen.getByText(/Аккаунт будет удалён через 30 дн\./),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Подтвердить сейчас' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Позже' })).toBeInTheDocument();
  });

  it('never opens when the email is already verified', async () => {
    setMockMe({ email_verified: true, verification_deadline_at: null });
    renderBanner();

    // Let the async kvPrefs gate settle (wrapped in act) and confirm it
    // never opens. The gate returns early here, so no dialog ever mounts.
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('shows at most once per calendar day', async () => {
    await kvPrefs.setItem(LAST_SHOWN_KEY, localDateKey());
    setMockMe({ email_verified: false, verification_deadline_at: inDays(30) });
    renderBanner();

    // The kvPrefs mark already reads "today", so the async gate settles
    // (under act) without ever opening a second banner for the day.
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('never opens outside the tab zone (register onboarding)', async () => {
    // The set-password skip branch signs the user in MID-onboarding on
    // /register with email_verified=false — the banner must not open on
    // top of the onboarding steps.
    setMockMe({ email_verified: false, verification_deadline_at: inDays(30) });
    renderBanner(paths.register);

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('re-opens on return to the app when the calendar day has changed', async () => {
    setMockMe({ email_verified: false, verification_deadline_at: inDays(30) });
    renderBanner();

    await userEvent.click(await screen.findByRole('button', { name: 'Позже' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    // The calendar day flips while the app sleeps in the background: the
    // stored mark now reads "yesterday", and the visibility/appStateChange
    // listeners re-run the daily check on return.
    await kvPrefs.setItem(LAST_SHOWN_KEY, localDateKey(new Date(Date.now() - DAY_MS)));
    document.dispatchEvent(new Event('visibilitychange'));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('uses a warning tone when fewer than 7 days remain', async () => {
    setMockMe({ email_verified: false, verification_deadline_at: inDays(3) });
    renderBanner();

    const title = await screen.findByText('Подтвердите email');
    expect(title.className).toContain('text-danger');
  });

  it('asks to ADD an email when the account has none', async () => {
    setMockMe({ email: null, email_verified: false, verification_deadline_at: inDays(30) });
    renderBanner();

    expect(await screen.findByText('Добавьте email')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Указать email' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Подтвердить сейчас' })).toBeNull();
  });

  it('confirms the email right from the banner', async () => {
    setMockMe({ email_verified: false, verification_deadline_at: inDays(30) });
    renderBanner();

    await userEvent.click(await screen.findByRole('button', { name: 'Подтвердить сейчас' }));
    expect(await screen.findByText('Код отправлен на client@dopafit.dev')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Код подтверждения'), {
      target: { value: '000000' },
    });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    // Успех подтверждения показывает тост.
    expect(present).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Email подтверждён' }),
    );
  });

  it('surfaces a toast when requesting the code fails with a non-429 error', async () => {
    setMockMe({ email_verified: false, verification_deadline_at: inDays(30) });
    server.use(
      http.post(`${env.apiUrl}/api/v1/users/me/contact/verify-request`, () =>
        HttpResponse.json({ code: 'server_error', message: 'boom', details: null }, { status: 500 }),
      ),
    );
    renderBanner();

    await userEvent.click(await screen.findByRole('button', { name: 'Подтвердить сейчас' }));

    // A non-429 failure used to be silent (spinner just stopped); now it toasts.
    await waitFor(() =>
      expect(present).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Не удалось отправить код. Попробуйте позже.' }),
      ),
    );
    // The OTP dialog must NOT open on a hard failure.
    expect(screen.queryByText(/Код отправлен/)).toBeNull();
  });
});
