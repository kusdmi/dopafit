import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setMockMe } from '@/entities/user/api/mocks';
import { useSessionStore } from '@/entities/session/model/store';
import { server } from '@/app/mocks/server';
import { env } from '@/shared/config/env';
import { ACCOUNT_DELETED_TOAST_FLAG } from '@/shared/config/session-flags';
import { mockAuthResponse } from '@/shared/test/factories';

import { DeleteAccountPage } from './DeleteAccountPage';

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DeleteAccountPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DeleteAccountPage', () => {
  const realLocation = window.location;
  let assignSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
    sessionStorage.removeItem(ACCOUNT_DELETED_TOAST_FLAG);
    await useSessionStore.getState().setSession(mockAuthResponse());
    // jsdom's real window.location.assign throws "Not implemented" and is a
    // non-configurable data property — a get-trap over the real location would
    // break the proxy invariant. Mirror SettingsFlow.test.tsx: proxy a plain
    // { assign } stub that delegates every other read (pathname/href/...) to the
    // real location, so we can observe the farewell exit targeting /welcome.
    assignSpy = vi.fn();
    const locationStub = new Proxy(
      { assign: assignSpy },
      {
        get(overrides, prop) {
          if (prop in overrides) {
            return Reflect.get(overrides, prop);
          }
          const value = Reflect.get(realLocation, prop);
          return typeof value === 'function' ? value.bind(realLocation) : value;
        },
      },
    );
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: locationStub,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
    sessionStorage.removeItem(ACCOUNT_DELETED_TOAST_FLAG);
  });

  it('warns that deletion is irreversible before starting', async () => {
    setMockMe({ login_method: 'code', has_password: false });
    renderPage();

    expect(
      await screen.findByText(/Восстановление невозможно/),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Удалить аккаунт' }));
    expect(await screen.findByText('Удалить аккаунт навсегда?')).toBeInTheDocument();
  });

  it('confirms by code, then tears down and exits to /welcome with the toast flag', async () => {
    setMockMe({ login_method: 'code', has_password: false });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Удалить аккаунт' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Удалить' }));

    expect(await screen.findByText('Код отправлен на client@dopafit.dev')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Код подтверждения'), {
      target: { value: '000000' },
    });

    // UX-6: no farewell screen with a stale menu — go straight to /welcome via a
    // full teardown + hard navigation, handing the "account deleted" toast off
    // to WelcomePage through a sessionStorage flag (survives the reload).
    await waitFor(() => {
      expect(assignSpy).toHaveBeenCalledWith('/welcome');
    });
    expect(sessionStorage.getItem(ACCOUNT_DELETED_TOAST_FLAG)).toBe('1');
    expect(screen.queryByRole('button', { name: 'На экран входа' })).not.toBeInTheDocument();
  });

  it('surfaces an error on the warning step when delete-request fails (non-429)', async () => {
    setMockMe({ login_method: 'code', has_password: false });
    server.use(
      http.post(`${env.apiUrl}/api/v1/users/me/delete-request`, () =>
        HttpResponse.json(
          { code: 'server_error', message: 'Server error', details: null },
          { status: 500 },
        ),
      ),
    );
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Удалить аккаунт' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Удалить' }));

    // The failure must be surfaced on the warning step.
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    // The user must NOT be advanced to the identity-check step.
    expect(screen.queryByLabelText('Код подтверждения')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Пароль')).not.toBeInTheDocument();
    // Still on the warning step.
    expect(screen.getByRole('button', { name: 'Удалить аккаунт' })).toBeInTheDocument();
  });

  it('confirms by password for a password-login user', async () => {
    setMockMe({ login_method: 'password', has_password: true });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Удалить аккаунт' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Удалить' }));

    const passwordField = await screen.findByLabelText('Пароль');
    await userEvent.type(passwordField, 'WrongPass1');
    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить удаление' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Неверный пароль');

    await userEvent.clear(screen.getByLabelText('Пароль'));
    await userEvent.type(screen.getByLabelText('Пароль'), 'Dopafit1Demo');
    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить удаление' }));
    // UX-6: straight to the guest exit, no farewell screen in between.
    await waitFor(() => {
      expect(assignSpy).toHaveBeenCalledWith('/welcome');
    });
    expect(sessionStorage.getItem(ACCOUNT_DELETED_TOAST_FLAG)).toBe('1');
  });

  it('exits cleanly even when /users/me starts answering 401 after confirm', async () => {
    setMockMe({ login_method: 'code', has_password: false });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Удалить аккаунт' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Удалить' }));
    await screen.findByText('Код отправлен на client@dopafit.dev');

    // The real API answers 401 to ANY /users/me call after delete-confirm:
    // the tokens are revoked together with the account. cancelQueries() on
    // success stops the in-flight useMe so a 401 can't trip the global
    // unauthorized teardown mid-exit; the ordered signOutAndExit owns the wipe.
    server.use(
      http.get(`${env.apiUrl}/api/v1/users/me`, () =>
        HttpResponse.json(
          { code: 'unauthorized', message: 'Unauthorized', details: null },
          { status: 401 },
        ),
      ),
    );

    fireEvent.change(screen.getByLabelText('Код подтверждения'), {
      target: { value: '000000' },
    });

    // Deletion still resolves into the guest exit: flag set, hard-navigate to
    // /welcome, session torn down. No farewell screen lingers.
    await waitFor(() => {
      expect(assignSpy).toHaveBeenCalledWith('/welcome');
    });
    expect(sessionStorage.getItem(ACCOUNT_DELETED_TOAST_FLAG)).toBe('1');
    await waitFor(() => {
      expect(useSessionStore.getState().isAuthenticated).toBe(false);
    });
  });
});
