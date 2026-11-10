import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSessionStore } from '@/entities/session/model/store';
import { env } from '@/shared/config/env';
import { paths } from '@/shared/config/paths';
import { server } from '@/app/mocks/server';
import { mockAuthResponse } from '@/shared/test/factories';
import { OfflineIndicator } from '@/features/sync-status/OfflineIndicator';

import { AppRoutes } from './router';

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
      <OfflineIndicator />
    </QueryClientProvider>,
  );
}

describe('settings stage 1 flows', () => {
  const realLocation = window.location;
  let assignSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    await useSessionStore.getState().clearSession();
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: true,
    });
    // jsdom's real window.location.assign throws "Not implemented" and swallows
    // the navigation, so the teardown redirect can't be observed unmocked. Its
    // `assign` is also non-configurable, so we swap the whole location object for
    // a stub that delegates every read (pathname/href/...) to the real location
    // — keeping react-router's history working — but spies on assign, letting us
    // assert sign-out actually targets /welcome (teardown regression guard).
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
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: realLocation,
    });
  });

  it('opens settings from home and updates personal data', async () => {
    await signIn();
    renderRoute(paths.settings);

    await userEvent.click(await screen.findByRole('link', { name: 'Личные данные' }));

    await userEvent.clear(await screen.findByLabelText('Имя'));
    await userEvent.type(screen.getByLabelText('Имя'), 'Анна Обновлённая');
    await userEvent.clear(screen.getByLabelText('Город'));
    await userEvent.type(screen.getByLabelText('Город'), 'Екатеринбург');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить профиль' }));

    expect(await screen.findByText('Профиль сохранён')).toBeInTheDocument();
    expect(useSessionStore.getState().user?.email).toBe('client@dopafit.dev');
  });

  it('keeps profile gender unset when saving without a previous gender', async () => {
    await signIn();
    renderRoute(paths.settingsProfile);

    const gender = await screen.findByLabelText('Пол');
    expect(gender).toHaveValue('');

    await userEvent.click(screen.getByRole('button', { name: 'Сохранить профиль' }));
    expect(await screen.findByText('Профиль сохранён')).toBeInTheDocument();
  });

  it('updates theme settings', async () => {
    await signIn();
    renderRoute(paths.settingsTheme);

    // Theme applies instantly on selection and persists to the server.
    await userEvent.click(await screen.findByRole('button', { name: /Светлая/ }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(await screen.findByText('Тема сохранена')).toBeInTheDocument();

    // System removes the explicit attribute so the OS preference drives the palette.
    await userEvent.click(screen.getByRole('button', { name: /Системная/ }));
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('changes password', async () => {
    await signIn();
    renderRoute(paths.settingsSecurity);

    await userEvent.type(await screen.findByLabelText('Текущий пароль'), 'Dopafit1Demo');
    await userEvent.type(screen.getByLabelText('Новый пароль'), 'NewPassword1');
    await userEvent.type(screen.getByLabelText('Повторите пароль'), 'NewPassword1');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить пароль' }));
    expect(await screen.findByText('Пароль сохранён')).toBeInTheDocument();
  });

  it('logs out from settings and redirects to welcome', async () => {
    await signIn();
    renderRoute(paths.settings);

    await userEvent.click(await screen.findByRole('button', { name: /Выйти/ }));

    // The action is confirmed through a dialog before the session is cleared.
    expect(useSessionStore.getState().isAuthenticated).toBe(true);
    expect(await screen.findByText('Выйти из аккаунта?')).toBeInTheDocument();

    // Two "Выйти" buttons exist (settings trigger + dialog confirm); the dialog
    // renders through a portal appended to document.body, so its confirm is last.
    const confirmButtons = await screen.findAllByRole('button', { name: 'Выйти' });
    await userEvent.click(confirmButtons[confirmButtons.length - 1]);

    // The redirect trails the auth flag: clearSession() flips isAuthenticated and
    // only then finishes wiping the workout store, so assign() lands a tick later.
    await waitFor(() => {
      expect(useSessionStore.getState().isAuthenticated).toBe(false);
    });
    await waitFor(() => {
      expect(assignSpy).toHaveBeenCalledWith('/welcome');
    });
  });

  it('shows offline indicator when both transport probes and API requests fail', async () => {
    await signIn();
    server.use(http.get(`${env.apiUrl}/api/v1/*`, () => HttpResponse.error()));

    renderRoute(paths.settings);

    // The wide banner was replaced by a small top-corner icon-button (UX-2);
    // the offline explanation now lives in a popover opened on tap.
    const button = await screen.findByRole('button', { name: 'Офлайн-режим' }, { timeout: 2500 });
    expect(button).toBeInTheDocument();
    await userEvent.click(button);
    expect(await screen.findByRole('dialog', { name: 'Офлайн-режим' })).toBeInTheDocument();
    expect(screen.getByText(/синхронизируются/)).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Личные данные' })).toBeInTheDocument();
  });

  it('disables settings saves while offline', async () => {
    await signIn();
    renderRoute(paths.settingsProfile);
    const save = await screen.findByRole('button', { name: 'Сохранить профиль' });
    server.use(http.get(`${env.apiUrl}/api/v1/health`, () => HttpResponse.error()));
    fireEvent(window, new Event('focus'));
    expect(
      await screen.findByRole('button', { name: 'Офлайн-режим' }, { timeout: 2500 }),
    ).toBeInTheDocument();
    expect(save).toBeDisabled();
  });
});
