import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as accountActions from '@/entities/user/api/use-account-actions';
import { setMockMe } from '@/entities/user/api/mocks';
import { useSessionStore } from '@/entities/session/model/store';
import { mockAuthResponse } from '@/shared/test/factories';

import { SecuritySettingsPage } from './SecuritySettingsPage';

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SecuritySettingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('SecuritySettingsPage', () => {
  beforeEach(async () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
    await useSessionStore.getState().setSession(mockAuthResponse());
  });

  it('disables password methods with a hint until a password is set', async () => {
    setMockMe({ has_password: false, login_method: 'code', email_verified: true });
    renderPage();

    expect(await screen.findByRole('radio', { name: /Код на email/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /^Пароль/ })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /Код \+ пароль/ })).toBeDisabled();
    expect(screen.getAllByText('Сначала задайте пароль')).toHaveLength(2);
  });

  it('disables code methods with a hint until the email is verified', async () => {
    setMockMe({ has_password: true, login_method: 'password', email_verified: false });
    renderPage();

    expect(await screen.findByRole('radio', { name: /^Пароль/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Код на email/ })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /Код \+ пароль/ })).toBeDisabled();
    expect(screen.getAllByText('Сначала подтвердите email')).toHaveLength(2);
  });

  it('hints that password login is not on yet when a password exists but method is code (B004)', async () => {
    setMockMe({ has_password: true, login_method: 'code', email_verified: true });
    renderPage();

    expect(await screen.findByText(/Вход по паролю пока не включён/)).toBeInTheDocument();
  });

  it('does not show the password-login hint once the method is password', async () => {
    setMockMe({ has_password: true, login_method: 'password', email_verified: true });
    renderPage();

    await screen.findByRole('radio', { name: /^Пароль/ });
    expect(screen.queryByText(/Вход по паролю пока не включён/)).toBeNull();
  });

  it('switches the method through an email code', async () => {
    setMockMe({ has_password: true, login_method: 'password', email_verified: true });
    renderPage();

    await userEvent.click(await screen.findByRole('radio', { name: /Код \+ пароль/ }));

    // the confirmation dialog with the OTP appears after the code is sent
    expect(await screen.findByText('Подтвердите смену способа входа')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Код подтверждения'), {
      target: { value: '000000' },
    });

    expect(await screen.findByText('Способ входа обновлён')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /Код \+ пароль/ })).toBeChecked();
    });
  });

  it('adds the first password without asking for the current one', async () => {
    setMockMe({ has_password: false, login_method: 'code', email_verified: true });
    renderPage();

    expect(await screen.findByLabelText('Новый пароль')).toBeInTheDocument();
    expect(screen.queryByLabelText('Текущий пароль')).toBeNull();

    await userEvent.type(screen.getByLabelText('Новый пароль'), 'Dopafit1New');
    await userEvent.type(screen.getByLabelText('Повторите пароль'), 'Dopafit1New');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить пароль' }));
    expect(await screen.findByText('Пароль сохранён')).toBeInTheDocument();
  });

  it('rejects a mismatched confirm password client-side without calling the endpoint', async () => {
    setMockMe({ has_password: false, login_method: 'code', email_verified: true });
    const mutate = vi.fn();
    const spy = vi.spyOn(accountActions, 'useChangePassword').mockReturnValue({
      mutate,
      reset: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
    } as never);
    renderPage();

    await userEvent.type(await screen.findByLabelText('Новый пароль'), 'Dopafit1New');
    await userEvent.type(screen.getByLabelText('Повторите пароль'), 'Dopafit1Other');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить пароль' }));

    expect(await screen.findByText('Пароли не совпадают')).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('rejects a too-short new password client-side', async () => {
    setMockMe({ has_password: false, login_method: 'code', email_verified: true });
    renderPage();

    await userEvent.type(await screen.findByLabelText('Новый пароль'), 'Short1');
    await userEvent.type(screen.getByLabelText('Повторите пароль'), 'Short1');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить пароль' }));

    expect(
      (
        await screen.findAllByText(
          'От 8 до 32 символов, включая заглавную и строчную латинские буквы и цифру',
        )
      )[0],
    ).toBeInTheDocument();
    expect(screen.queryByText('Пароль сохранён')).toBeNull();
  });

  it('requires the current password when one is set', async () => {
    setMockMe({ has_password: true, login_method: 'password', email_verified: true });
    renderPage();

    expect(await screen.findByLabelText('Текущий пароль')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Текущий пароль'), 'WrongPass1');
    await userEvent.type(screen.getByLabelText('Новый пароль'), 'Dopafit1New');
    await userEvent.type(screen.getByLabelText('Повторите пароль'), 'Dopafit1New');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить пароль' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText('Текущий пароль'));
    await userEvent.type(screen.getByLabelText('Текущий пароль'), 'Dopafit1Demo');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить пароль' }));
    expect(await screen.findByText('Пароль сохранён')).toBeInTheDocument();
  });
});
