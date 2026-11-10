import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useSessionStore } from '@/entities/session/model/store';
import { mockAuthResponse } from '@/shared/test/factories';

import { AppRoutes } from './router';

async function renderRoute(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  window.history.pushState({}, '', path);
  return render(
    <QueryClientProvider client={queryClient}>
      <AppRoutes />
    </QueryClientProvider>,
  );
}

describe('auth and onboarding flows', () => {
  beforeEach(async () => {
    await useSessionStore.getState().clearSession();
  });

  async function fillAccountStep(
    email: string,
    role: 'Тренируюсь сам' | 'Я тренер' = 'Тренируюсь сам',
  ) {
    await userEvent.type(screen.getByLabelText('Имя'), 'Анна Иванова');
    await userEvent.type(screen.getByLabelText('Email'), email);
    await userEvent.click(screen.getByRole('radio', { name: role }));
    await userEvent.click(screen.getByRole('button', { name: 'Далее' }));
  }

  // Product decision: the personal-data consent checkbox was replaced with a
  // static caption + policy link under the submit button (AccountStep always
  // sends personal_data_consent: true). The submit button is therefore no
  // longer gated on it — this test just pins the caption/link instead of the
  // removed gating behavior.
  it('shows a personal data consent caption linking to the policy', async () => {
    await renderRoute('/register');

    // the consent link points to the static legal stub (exact file name with
    // the .html extension: Vite and the Capacitor bundle server resolve static
    // files by exact path, an extensionless URL falls through to the SPA)
    expect(
      screen.getByRole('link', { name: 'обработку персональных данных' }),
    ).toHaveAttribute('href', '/legal/personal-data.html');
  });

  // The screen title lives in the transparent PageHeader (PageTitle = <h1>)
  // while every wizard step and flow heading below it is an <h2>. Pin the
  // hierarchy so a step reintroducing its own <h1> — or the header title going
  // missing again — fails here instead of silently reaching a screen reader.
  it.each([
    ['/login', 'Вход'],
    ['/register', 'Регистрация'],
    ['/password-reset', 'Восстановление пароля'],
  ])('gives %s exactly one h1 carrying the screen title', async (path, title) => {
    await renderRoute(path);

    const headings = await screen.findAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent(title);
  });

  // Same rule, checked deeper in the wizard: the initial-render case above
  // only sees each flow's first step, so walk on to a later one and re-check
  // that the header title is still the only <h1>.
  it('keeps a single h1 on the later wizard steps', async () => {
    await renderRoute('/register');
    await fillAccountStep('headings@example.com');

    await screen.findByText('Подтвердите email');
    let headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent('Регистрация');

    fireEvent.change(screen.getByLabelText('Код подтверждения'), {
      target: { value: '000000' },
    });

    await screen.findByText('Расскажите о себе');
    headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent('Регистрация');
  });

  it('registers through email code and continues to onboarding', async () => {
    await renderRoute('/register');
    await fillAccountStep('anna@example.com');

    expect(await screen.findByText('Подтвердите email')).toBeInTheDocument();
    expect(screen.getByText('Код отправлен на')).toBeInTheDocument();
    expect(screen.getByText('anna@example.com')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Код подтверждения'), {
      target: { value: '000000' },
    });

    // signed in, onboarding continues on the same route
    expect(await screen.findByText('Расскажите о себе')).toBeInTheDocument();
    expect(useSessionStore.getState().isAuthenticated).toBe(true);
    expect(useSessionStore.getState().user?.email).toBe('anna@example.com');
    expect(useSessionStore.getState().user?.email_verified).toBe(true);
    expect(useSessionStore.getState().user?.login_method).toBe('code');
  });

  it('returns to the account step from the code step to change the email', async () => {
    await renderRoute('/register');
    await fillAccountStep('typo@example.com');

    await screen.findByText('Подтвердите email');
    await userEvent.click(screen.getByRole('button', { name: 'Изменить email' }));

    // back on the account step: the email field is visible
    expect(await screen.findByLabelText('Email')).toBeInTheDocument();

    // and the account step can be submitted again
    await userEvent.click(screen.getByRole('button', { name: 'Далее' }));
    expect(await screen.findByText('Подтвердите email')).toBeInTheDocument();
  });

  it('warns about the 90-day deletion on skip and requires a password', async () => {
    await renderRoute('/register');
    await fillAccountStep('skip@example.com');

    await screen.findByText('Подтвердите email');
    await userEvent.click(screen.getByRole('button', { name: 'Пропустить' }));

    // the warning dialog: deletion in 90 days, explicit choice
    expect(
      await screen.findByText(
        'Подтвердить email нужно в течение 90 дней, иначе аккаунт будет удалён вместе с данными.',
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Вернуться к подтверждению' }));
    expect(screen.getByText('skip@example.com')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Пропустить' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Всё равно пропустить' }));

    expect(await screen.findByText('Создайте пароль')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Пароль'), 'Dopafit1Pass');
    await userEvent.type(screen.getByLabelText('Повторите пароль'), 'Dopafit1Pass');
    await userEvent.click(screen.getByRole('button', { name: 'Продолжить' }));

    expect(await screen.findByText('Расскажите о себе')).toBeInTheDocument();
    expect(useSessionStore.getState().user?.has_password).toBe(true);
    expect(useSessionStore.getState().user?.login_method).toBe('password');
    expect(useSessionStore.getState().user?.email_verified).toBe(false);
  });

  it('redirects authenticated users away from auth flows', async () => {
    await useSessionStore.getState().setSession(mockAuthResponse());

    await renderRoute('/register');

    expect(await screen.findByText('Серия')).toBeInTheDocument();
  });

  it('shows trainer clients-per-month step only for trainer registration', async () => {
    await renderRoute('/register');

    await fillAccountStep('coach@example.com', 'Я тренер');
    fireEvent.change(await screen.findByLabelText('Код подтверждения'), {
      target: { value: '000000' },
    });
    await userEvent.click(await screen.findByRole('radio', { name: 'Мужской' }));
    // Дата рождения обязательна и не предзаполнена, в отличие от веса и роста.
    fireEvent.change(screen.getByLabelText('Дата рождения'), { target: { value: '1990-04-17' } });
    await userEvent.click(screen.getByRole('button', { name: 'Продолжить' }));

    expect(
      await screen.findByText('Укажите среднее кол-во ваших клиентов в месяц'),
    ).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Клиентов в месяц'), '18');
    await userEvent.click(screen.getByRole('button', { name: 'Завершить' }));

    await waitFor(() => {
      expect(useSessionStore.getState().user?.role).toBe('trainer');
    });
  });

  it('resets the password through email, code and a new password', async () => {
    await renderRoute('/password-reset');

    await userEvent.click(screen.getByRole('button', { name: 'Далее' }));
    expect(await screen.findByText('Введите корректный email')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Email'), 'client@dopafit.dev');
    await userEvent.click(screen.getByRole('button', { name: 'Далее' }));

    expect(await screen.findByText('client@dopafit.dev')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Код подтверждения'), {
      target: { value: '000000' },
    });

    expect(await screen.findByText('Новый пароль')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Пароль'), 'Dopafit1New');
    await userEvent.type(screen.getByLabelText('Повторите пароль'), 'Dopafit1New');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => {
      expect(window.location.pathname).toBe('/login');
    });
  });

  it('returns to the email step from the code step during password reset', async () => {
    // Anti-enumeration always advances to the code step, so a mistyped email
    // strands the user unless there is a way back.
    await renderRoute('/password-reset');

    await userEvent.type(screen.getByLabelText('Email'), 'typo@dopafit.dev');
    await userEvent.click(screen.getByRole('button', { name: 'Далее' }));

    expect(await screen.findByText('typo@dopafit.dev')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Изменить email' }));

    // back on the email step and it can be submitted again
    expect(await screen.findByLabelText('Email')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Далее' }));
    expect(await screen.findByText('typo@dopafit.dev')).toBeInTheDocument();
  });

  it('does not reveal whether a contact exists during password reset', async () => {
    // Anti-enumeration: an unknown email advances to the code step just like a
    // known one. The code simply never arrives / never validates.
    await renderRoute('/password-reset');

    await userEvent.type(screen.getByLabelText('Email'), 'ghost@nowhere.dev');
    await userEvent.click(screen.getByRole('button', { name: 'Далее' }));

    expect(await screen.findByLabelText('Код подтверждения')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Код подтверждения'), {
      target: { value: '000000' },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Неверный или просроченный код');
  });

  it('disables auth submit actions while offline', async () => {
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: false,
    });

    await renderRoute('/register');

    expect(await screen.findByText('Недоступно офлайн')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Недоступно офлайн' })).toBeDisabled();
  });
});
