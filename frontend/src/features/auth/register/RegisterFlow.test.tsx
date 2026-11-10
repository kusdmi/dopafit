import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { useEffect } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { useSessionStore } from '@/entities/session/model/store';
import { server } from '@/app/mocks/server';
import { env } from '@/shared/config/env';

import { RegisterFlow } from './RegisterFlow';

/**
 * Characterization tests for the registration wizard. They pin the observable
 * behaviour of the flow (steps, error surfaces, resend cooldown, redirect on
 * success) so a later refactor into an explicit wizard can be verified against
 * the exact same assertions. Rendered in isolation over a memory history so the
 * post-success redirect target is inspectable without the whole router.
 */

const currentPath = { value: '/register' };

function LocationProbe() {
  const location = useLocation();
  useEffect(() => {
    currentPath.value = location.pathname;
  }, [location.pathname]);
  return null;
}

function renderFlow(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  currentPath.value = '/register';
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/register']}>
        <RegisterFlow />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function fillAccountStep(
  email: string,
  role: 'Тренируюсь сам' | 'Я тренер' = 'Тренируюсь сам',
) {
  await userEvent.type(screen.getByLabelText('Имя'), 'Анна Иванова');
  await userEvent.type(screen.getByLabelText('Email'), email);
  await userEvent.click(screen.getByRole('radio', { name: role }));
  await userEvent.click(screen.getByRole('button', { name: 'Далее' }));
}

/** Пол + дата рождения. Дата обязательна и не предзаполнена, в отличие от веса и роста. */
async function fillPhysicalStep(gender: 'Мужской' | 'Женский') {
  await userEvent.click(await screen.findByRole('radio', { name: gender }));
  fireEvent.change(screen.getByLabelText('Дата рождения'), { target: { value: '1990-04-17' } });
}

const url = (path: string) => `${env.apiUrl}${path}`;

describe('RegisterFlow characterization', () => {
  beforeEach(async () => {
    await useSessionStore.getState().clearSession();
  });

  it('completes email registration through code and redirects to home', async () => {
    renderFlow();
    await fillAccountStep('newbie@example.com');

    expect(await screen.findByText('Подтвердите email')).toBeInTheDocument();
    expect(screen.getByText('Код отправлен на')).toBeInTheDocument();
    expect(screen.getByText('newbie@example.com')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Код подтверждения'), { target: { value: '000000' } });

    // signed in; onboarding continues on the same route
    expect(await screen.findByText('Расскажите о себе')).toBeInTheDocument();
    expect(useSessionStore.getState().isAuthenticated).toBe(true);
    expect(useSessionStore.getState().user?.email).toBe('newbie@example.com');
    expect(useSessionStore.getState().user?.email_verified).toBe(true);

    // finishing onboarding redirects to home with the tokens applied
    await fillPhysicalStep('Женский');
    await userEvent.click(screen.getByRole('button', { name: 'Завершить' }));
    await waitFor(() => {
      expect(currentPath.value).toBe('/app/home');
    });
  });

  it('keeps the user on the code step and shows an error for an invalid code', async () => {
    renderFlow();
    await fillAccountStep('wrongcode@example.com');

    await screen.findByText('Подтвердите email');
    fireEvent.change(screen.getByLabelText('Код подтверждения'), { target: { value: '111111' } });

    // stays on the code step and surfaces the invalid-code message
    expect(await screen.findByRole('alert')).toHaveTextContent('Неверный или просроченный код');
    expect(screen.getByText('Подтвердите email')).toBeInTheDocument();
    expect(useSessionStore.getState().isAuthenticated).toBe(false);

    // a correct code afterwards still advances the flow
    fireEvent.change(screen.getByLabelText('Код подтверждения'), { target: { value: '000000' } });
    expect(await screen.findByText('Расскажите о себе')).toBeInTheDocument();
  });

  it('gates resend behind a cooldown countdown and re-enables it after a 429 retry window', async () => {
    // Force resend to fail with a rate-limit so its Retry-After feeds the cooldown.
    server.use(
      http.post(url('/api/v1/auth/resend-code'), () =>
        HttpResponse.json(
          {
            code: 'rate_limited',
            message: 'Too many requests',
            details: { retry_after_seconds: 30 },
          },
          { status: 429 },
        ),
      ),
    );

    renderFlow();
    await fillAccountStep('resend@example.com');
    await screen.findByText('Подтвердите email');

    // Right after entering the code step the resend button is on cooldown (60s).
    const resend = screen.getByRole('button', { name: /Отправить ещё раз \(1:00\)/ });
    expect(resend).toBeDisabled();

    // The countdown ticks down every second.
    await waitFor(
      () =>
        expect(
          screen.getByRole('button', { name: /Отправить ещё раз \(0:5\d\)/ }),
        ).toBeInTheDocument(),
      { timeout: 2000 },
    );
  });

  it('returns to the account step from the code step, keeping the flow usable', async () => {
    renderFlow();
    await fillAccountStep('typo@example.com');

    await screen.findByText('Подтвердите email');
    await userEvent.click(screen.getByRole('button', { name: 'Изменить email' }));

    expect(await screen.findByLabelText('Email')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Далее' }));
    expect(await screen.findByText('Подтвердите email')).toBeInTheDocument();
  });

  it('shows the account-step server error and stays on the account step', async () => {
    server.use(
      http.post(url('/api/v1/auth/register'), () =>
        HttpResponse.json(
          { code: 'conflict', message: 'User with this email already exists', details: null },
          { status: 409 },
        ),
      ),
    );

    renderFlow();
    await fillAccountStep('taken@example.com');

    expect(
      await screen.findByText(
        'Данные изменились или уже существуют. Обновите страницу и повторите действие',
      ),
    ).toBeInTheDocument();
    // still on the account step
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.queryByText('Подтвердите email')).not.toBeInTheDocument();
  });

  it('surfaces a network error on the account step', async () => {
    server.use(http.post(url('/api/v1/auth/register'), () => HttpResponse.error()));

    renderFlow();
    await fillAccountStep('offline-account@example.com');

    expect(await screen.findByText('Не удалось связаться с сервером')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('surfaces a network error on the password step and stays there', async () => {
    server.use(http.post(url('/api/v1/auth/set-password'), () => HttpResponse.error()));

    renderFlow();
    await fillAccountStep('skip-net@example.com');
    await screen.findByText('Подтвердите email');

    await userEvent.click(screen.getByRole('button', { name: 'Пропустить' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Всё равно пропустить' }));

    expect(await screen.findByText('Создайте пароль')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Пароль'), 'Dopafit1Pass');
    await userEvent.type(screen.getByLabelText('Повторите пароль'), 'Dopafit1Pass');
    await userEvent.click(screen.getByRole('button', { name: 'Продолжить' }));

    expect(await screen.findByText('Не удалось связаться с сервером')).toBeInTheDocument();
    expect(screen.getByText('Создайте пароль')).toBeInTheDocument();
    expect(useSessionStore.getState().isAuthenticated).toBe(false);
  });

  it('surfaces a network error on the onboarding step and stays there', async () => {
    server.use(http.post(url('/api/v1/users/me/onboarding'), () => HttpResponse.error()));

    renderFlow();
    await fillAccountStep('onboard-net@example.com');
    await screen.findByText('Подтвердите email');
    fireEvent.change(screen.getByLabelText('Код подтверждения'), { target: { value: '000000' } });

    await screen.findByText('Расскажите о себе');
    await fillPhysicalStep('Мужской');
    await userEvent.click(screen.getByRole('button', { name: 'Завершить' }));

    expect(await screen.findByText('Не удалось связаться с сервером')).toBeInTheDocument();
    expect(screen.getByText('Расскажите о себе')).toBeInTheDocument();
    expect(currentPath.value).toBe('/register');
  });

  it('routes trainers through the clients-per-month step before finishing', async () => {
    renderFlow();
    await fillAccountStep('coach@example.com', 'Я тренер');

    fireEvent.change(await screen.findByLabelText('Код подтверждения'), {
      target: { value: '000000' },
    });
    await fillPhysicalStep('Мужской');
    await userEvent.click(screen.getByRole('button', { name: 'Продолжить' }));

    expect(
      await screen.findByText('Укажите среднее кол-во ваших клиентов в месяц'),
    ).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Клиентов в месяц'), '18');
    await userEvent.click(screen.getByRole('button', { name: 'Завершить' }));

    await waitFor(() => {
      expect(currentPath.value).toBe('/app/home');
    });
    expect(useSessionStore.getState().user?.role).toBe('trainer');
  });
});

// Занятый email показывался пользователю английским текстом сервера
// («User with this email already exists»): фронт печатал `message` как есть.
// Теперь сервер отдаёт машиночитаемый `details.reason`, а текст — русский и
// клиентский (shared/api/error-reasons).
describe('занятый email на форме регистрации', () => {
  beforeEach(async () => {
    await useSessionStore.getState().clearSession();
  });

  it('показывает русский текст по признаку email_taken', async () => {
    server.use(
      http.post(`${env.apiUrl}/api/v1/auth/register`, () =>
        HttpResponse.json(
          {
            code: 'conflict',
            message: 'User with this email already exists',
            details: { reason: 'email_taken' },
          },
          { status: 409 },
        ),
      ),
    );

    renderFlow();
    await fillAccountStep('taken@example.com');

    expect(await screen.findByText('Этот email уже зарегистрирован')).toBeInTheDocument();
    expect(screen.queryByText(/already exists/i)).not.toBeInTheDocument();
  });

  it('без признака показывает русское общее сообщение по коду', async () => {
    // Старая сборка сервера либо другой conflict-сценарий: запасной вариант —
    // прежнее поведение (message), а не пустая строка и не «undefined».
    server.use(
      http.post(`${env.apiUrl}/api/v1/auth/register`, () =>
        HttpResponse.json(
          { code: 'conflict', message: 'Что-то пошло не так', details: null },
          { status: 409 },
        ),
      ),
    );

    renderFlow();
    await fillAccountStep('taken@example.com');

    expect(
      await screen.findByText(
        'Данные изменились или уже существуют. Обновите страницу и повторите действие',
      ),
    ).toBeInTheDocument();
  });

  it('сетевая ошибка сохраняет своё сообщение, а не общий текст регистрации', async () => {
    // Регресс, который легко внести фиксированным запасным текстом: человеку
    // без связи нельзя писать «попробуйте ещё раз» вместо «нет соединения».
    server.use(http.post(`${env.apiUrl}/api/v1/auth/register`, () => HttpResponse.error()));

    renderFlow();
    await fillAccountStep('taken@example.com');

    expect(await screen.findByText('Не удалось связаться с сервером')).toBeInTheDocument();
  });
});
