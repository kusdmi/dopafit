import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { server } from '@/app/mocks/server';
import { env } from '@/shared/config/env';
import { CaptchaHost } from '@/shared/ui/CaptchaHost';
import { cancelCaptcha } from '@/shared/lib/captcha/challenge';
import { api, pendingBodiesSizeForTests } from './client';

vi.mock('@yandex/smart-captcha', () => ({
  useSmartCaptchaLoader: () => ({}),
  InvisibleSmartCaptcha: ({
    onSuccess,
    onNetworkError,
    onChallengeHidden,
    visible,
  }: {
    onSuccess: (token: string) => void;
    onNetworkError: () => void;
    onChallengeHidden: () => void;
    visible: boolean;
  }) => (
    <div data-testid="invisible-captcha" data-visible={String(visible)}>
      <button onClick={() => onSuccess('fresh-test-token')}>Успешная проверка</button>
      <button onClick={onChallengeHidden}>Закрыть задание</button>
      <button
        onClick={() => {
          onChallengeHidden();
          onSuccess('fresh-test-token');
        }}
      >
        Успех после скрытия
      </button>
      <button
        onClick={() => {
          onSuccess('fresh-test-token');
          onChallengeHidden();
        }}
      >
        Скрытие после успеха
      </button>
      <button onClick={onNetworkError}>Ошибка загрузки</button>
    </div>
  ),
}));

afterEach(() => cancelCaptcha());

const cases = [
  [
    '/api/v1/auth/login',
    () =>
      api.POST('/api/v1/auth/login', {
        body: { contact: 'test@example.test', password: 'ExamplePass1' },
      }),
  ],
  [
    '/api/v1/auth/login/request-code',
    () => api.POST('/api/v1/auth/login/request-code', { body: { contact: 'test@example.test' } }),
  ],
  [
    '/api/v1/auth/password-reset/request',
    () =>
      api.POST('/api/v1/auth/password-reset/request', { body: { contact: 'test@example.test' } }),
  ],
  [
    '/api/v1/auth/register',
    () =>
      api.POST('/api/v1/auth/register', {
        body: {
          email: 'test@example.test',
          full_name: 'Test',
          role: 'client',
          personal_data_consent: true,
        },
      }),
  ],
  [
    '/api/v1/auth/resend-code',
    () =>
      api.POST('/api/v1/auth/resend-code', {
        body: { contact: 'test@example.test', purpose: 'register' },
      }),
  ],
  [
    '/api/v1/users/me/contact/change-request',
    () =>
      api.POST('/api/v1/users/me/contact/change-request', {
        body: { type: 'email', new_contact: 'new@example.test' },
      }),
  ],
  [
    '/api/v1/users/me/contact/verify-request',
    () => api.POST('/api/v1/users/me/contact/verify-request', { body: { type: 'email' } }),
  ],
  [
    '/api/v1/users/me/delete-request',
    () => api.POST('/api/v1/users/me/delete-request', { body: {} }),
  ],
  [
    '/api/v1/users/me/login-method/request-code',
    () => api.POST('/api/v1/users/me/login-method/request-code', { body: {} }),
  ],
] as const;

function enabledCaptcha() {
  server.use(
    http.get(`${env.apiUrl}/api/v1/auth/captcha-config`, () =>
      HttpResponse.json({ site_key: 'public-test-key' }),
    ),
  );
}

describe('CAPTCHA request boundary', () => {
  it.each(cases)('waits for a fresh CAPTCHA before POST %s', async (path, send) => {
    enabledCaptcha();
    const received: unknown[] = [];
    server.use(
      http.post(`${env.apiUrl}${path}`, async ({ request }) => {
        received.push(await request.json());
        return HttpResponse.json({ ok: true });
      }),
    );
    render(<CaptchaHost />);
    const pending = send();
    await screen.findByTestId('invisible-captcha');
    expect(received).toHaveLength(0);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('invisible-captcha')).toHaveAttribute('data-visible', 'true');
    fireEvent.click(await screen.findByRole('button', { name: 'Успешная проверка' }));
    await pending;
    expect(received).toEqual([expect.objectContaining({ captcha_token: 'fresh-test-token' })]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(pendingBodiesSizeForTests()).toBe(0);
  });

  it('cancels without sending, preserves errors and permits a new attempt', async () => {
    enabledCaptcha();
    const received = vi.fn();
    server.use(
      http.post(`${env.apiUrl}/api/v1/auth/login`, () => {
        received();
        return HttpResponse.json({});
      }),
    );
    render(<CaptchaHost />);
    const pending = cases[0][1]().catch((error: unknown) => error);
    await screen.findByTestId('invisible-captcha');
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть задание' }));
    expect(await pending).toMatchObject({ code: 'captcha_cancelled' });
    expect(received).not.toHaveBeenCalled();
    const retry = cases[0][1]();
    fireEvent.click(await screen.findByRole('button', { name: 'Успешная проверка' }));
    await retry;
    expect(received).toHaveBeenCalledOnce();
  });

  it('shows a widget error and allows retry without posting an empty token', async () => {
    enabledCaptcha();
    render(<CaptchaHost />);
    const pending = cases[0][1]().catch((error: unknown) => error);
    fireEvent.click(await screen.findByRole('button', { name: 'Ошибка загрузки' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось загрузить проверку');
    fireEvent.click(screen.getByRole('button', { name: 'Повторить проверку' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть задание' }));
    await pending;
  });

  it('aborts an open challenge when the original request is aborted', async () => {
    enabledCaptcha();
    const controller = new AbortController();
    render(<CaptchaHost />);
    const pending = api
      .POST('/api/v1/auth/login', {
        body: { contact: 'test@example.test', password: 'ExamplePass1' },
        signal: controller.signal,
      })
      .catch((error: unknown) => error);
    await screen.findByTestId('invisible-captcha');
    act(() => controller.abort());
    expect(await pending).toMatchObject({ code: 'captcha_cancelled' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each(['Успех после скрытия', 'Скрытие после успеха'])(
    'completes successfully when SDK emits %s',
    async (button) => {
      enabledCaptcha();
      server.use(
        http.post(`${env.apiUrl}/api/v1/auth/login`, () => HttpResponse.json({ ok: true })),
      );
      render(<CaptchaHost />);
      const pending = cases[0][1]();
      fireEvent.click(await screen.findByRole('button', { name: button }));
      await expect(pending).resolves.toMatchObject({ data: { ok: true } });
      expect(screen.queryByTestId('invisible-captcha')).not.toBeInTheDocument();
    },
  );

  it('cancels a pending request when the host unmounts', async () => {
    enabledCaptcha();
    const { unmount } = render(<CaptchaHost />);
    const pending = cases[0][1]().catch((error: unknown) => error);
    await screen.findByTestId('invisible-captcha');
    unmount();
    expect(await pending).toMatchObject({ code: 'captcha_cancelled' });
    expect(pendingBodiesSizeForTests()).toBe(0);
  });

  it('fails closed when CAPTCHA configuration cannot be loaded', async () => {
    server.use(
      http.get(
        `${env.apiUrl}/api/v1/auth/captcha-config`,
        () => new HttpResponse(null, { status: 503 }),
      ),
    );
    const result = cases[0][1]();
    await expect(result).rejects.toMatchObject({ code: 'captcha_unavailable' });
    expect(pendingBodiesSizeForTests()).toBe(0);
  });

  it('keeps the local disabled flow usable without a CAPTCHA host', async () => {
    server.use(http.post(`${env.apiUrl}/api/v1/auth/login`, () => HttpResponse.json({ ok: true })));
    await expect(cases[0][1]()).resolves.toMatchObject({ data: { ok: true } });
    await waitFor(() => expect(pendingBodiesSizeForTests()).toBe(0));
  });
});
