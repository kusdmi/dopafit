import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSessionStore } from '@/entities/session/model/store';

import { LoginForm } from './LoginForm';
import { trackMetrikaGoal } from '@/shared/lib/telemetry/metrika';

vi.mock('@/shared/lib/telemetry/metrika', () => ({
  trackMetrikaGoal: vi.fn(),
  trackMetrikaContext: vi.fn(),
}));

function renderForm() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <LoginForm />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const otpInput = () => screen.getByLabelText('Код подтверждения');

describe('LoginForm', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await useSessionStore.getState().clearSession();
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
  });

  it('signs in with an email code (primary flow)', async () => {
    renderForm();
    await userEvent.type(screen.getByLabelText('Email'), 'code@dopafit.dev');
    await userEvent.click(screen.getByRole('button', { name: 'Получить код' }));

    expect(
      await screen.findByText(
        'Если для аккаунта доступен вход по коду, письмо отправлено на code@dopafit.dev',
      ),
    ).toBeInTheDocument();
    fireEvent.change(otpInput(), { target: { value: '000000' } });

    await waitFor(() => {
      expect(useSessionStore.getState().isAuthenticated).toBe(true);
    });
    expect(useSessionStore.getState().user?.email).toBe('code@dopafit.dev');
    await waitFor(() =>
      expect(trackMetrikaGoal).toHaveBeenCalledExactlyOnceWith('login_succeeded', {
        method: 'code',
      }),
    );
  });

  it('does not reveal whether the account exists (anti-enumeration)', async () => {
    renderForm();
    await userEvent.type(screen.getByLabelText('Email'), 'ghost@nowhere.dev');
    await userEvent.click(screen.getByRole('button', { name: 'Получить код' }));

    // Unknown email still reaches the OTP screen…
    expect(
      await screen.findByText(
        'Если для аккаунта доступен вход по коду, письмо отправлено на ghost@nowhere.dev',
      ),
    ).toBeInTheDocument();
    // …and a code attempt shows the same generic error as a wrong code.
    fireEvent.change(otpInput(), { target: { value: '000000' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Неверный или просроченный код');
    expect(useSessionStore.getState().isAuthenticated).toBe(false);
    expect(trackMetrikaGoal).not.toHaveBeenCalled();
  });

  it('explains password-only accounts and preserves the email when leaving the code step', async () => {
    renderForm();
    await userEvent.type(screen.getByLabelText('Email'), 'client@dopafit.dev');
    await userEvent.click(screen.getByRole('button', { name: 'Получить код' }));
    await screen.findByRole('heading', { name: 'Введите код' });
    expect(screen.getByText(/код для такого аккаунта не отправляется/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Войти по паролю' }));
    expect(screen.getByLabelText('Email')).toHaveValue('client@dopafit.dev');
    expect(screen.getByLabelText('Пароль')).toBeInTheDocument();
  });

  it('signs in with a password after switching the mode', async () => {
    renderForm();
    await userEvent.click(screen.getByRole('button', { name: 'Войти по паролю' }));

    await userEvent.type(screen.getByLabelText('Email'), 'client@dopafit.dev');
    await userEvent.type(screen.getByLabelText('Пароль'), 'WrongPass1');
    await userEvent.click(screen.getByRole('button', { name: 'Войти' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Неверный email или пароль');
    expect(trackMetrikaGoal).not.toHaveBeenCalled();

    await userEvent.clear(screen.getByLabelText('Пароль'));
    await userEvent.type(screen.getByLabelText('Пароль'), 'Dopafit1Demo');
    await userEvent.click(screen.getByRole('button', { name: 'Войти' }));
    await waitFor(() => {
      expect(useSessionStore.getState().isAuthenticated).toBe(true);
    });
    await waitFor(() =>
      expect(trackMetrikaGoal).toHaveBeenCalledExactlyOnceWith('login_succeeded', {
        method: 'password',
      }),
    );
  });

  it('asks for the password after the code for a 2fa account', async () => {
    renderForm();
    await userEvent.type(screen.getByLabelText('Email'), 'twofactor@dopafit.dev');
    await userEvent.click(screen.getByRole('button', { name: 'Получить код' }));
    fireEvent.change(await screen.findByLabelText('Код подтверждения'), {
      target: { value: '000000' },
    });

    expect(await screen.findByText('Теперь введите пароль')).toBeInTheDocument();
    expect(useSessionStore.getState().isAuthenticated).toBe(false);
    expect(trackMetrikaGoal).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText('Пароль'), 'Dopafit1Demo');
    await userEvent.click(screen.getByRole('button', { name: 'Войти' }));
    await waitFor(() => {
      expect(useSessionStore.getState().isAuthenticated).toBe(true);
    });
    expect(useSessionStore.getState().user?.login_method).toBe('two_factor');
    await waitFor(() =>
      expect(trackMetrikaGoal).toHaveBeenCalledExactlyOnceWith('login_succeeded', {
        method: 'two_factor',
      }),
    );
  });

  it('clears the verify error when going back to change the email (regression)', async () => {
    renderForm();
    await userEvent.type(screen.getByLabelText('Email'), 'ghost@nowhere.dev');
    await userEvent.click(screen.getByRole('button', { name: 'Получить код' }));

    // A wrong code surfaces the generic error on the OTP screen.
    fireEvent.change(await screen.findByLabelText('Код подтверждения'), {
      target: { value: '000000' },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Неверный или просроченный код');

    // Go back to change the email…
    await userEvent.click(screen.getByRole('button', { name: 'Изменить email' }));
    expect(await screen.findByLabelText('Email')).toBeInTheDocument();

    // …and request a fresh code: the new OTP screen must be pristine (no stale
    // error / no false shake from a fresh OtpInput mounting with a truthy error).
    await userEvent.click(screen.getByRole('button', { name: 'Получить код' }));
    expect(await screen.findByLabelText('Код подтверждения')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('lets a stuck 2fa user go back to the contact step (regression)', async () => {
    renderForm();
    await userEvent.type(screen.getByLabelText('Email'), 'twofactor@dopafit.dev');
    await userEvent.click(screen.getByRole('button', { name: 'Получить код' }));
    fireEvent.change(await screen.findByLabelText('Код подтверждения'), {
      target: { value: '000000' },
    });
    expect(await screen.findByText('Теперь введите пароль')).toBeInTheDocument();

    // A back control must exist and return to the contact step.
    await userEvent.click(screen.getByRole('button', { name: 'Изменить email' }));
    expect(await screen.findByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Получить код' })).toBeInTheDocument();
  });

  it('shows an inline error for an invalid email (TC-009)', async () => {
    renderForm();
    await userEvent.type(screen.getByLabelText('Email'), 'not-an-email');
    await userEvent.click(screen.getByRole('button', { name: 'Получить код' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Введите корректный email');
  });

  it('disables the primary action offline', () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
    renderForm();
    expect(screen.getByRole('button', { name: 'Недоступно офлайн' })).toBeDisabled();
  });
});
