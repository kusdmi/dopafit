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

const PAGE = {
  items: [
    {
      id: 'n1',
      type: 'subscription',
      title: 'Подписка активна',
      body: 'Спасибо!',
      payload: null,
      is_read: false,
      created_at: '2026-06-01T10:00:00Z',
    },
    {
      id: 'n2',
      type: 'system',
      title: 'Системное',
      body: 'Текст',
      payload: null,
      is_read: true,
      created_at: '2026-06-02T10:00:00Z',
    },
  ],
  total: 2,
  unread: 1,
};

describe('notifications feed screen', () => {
  beforeEach(async () => {
    await useSessionStore.getState().clearSession();
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
  });

  it('renders notification cards with title and body', async () => {
    server.use(http.get(`${env.apiUrl}/api/v1/notifications`, () => HttpResponse.json(PAGE)));

    await signIn();
    renderRoute(paths.homeNotifications);

    expect(await screen.findByText('Подписка активна')).toBeInTheDocument();
    expect(screen.getByText('Спасибо!')).toBeInTheDocument();
    expect(screen.getByText('Системное')).toBeInTheDocument();
    expect(screen.getByText('Текст')).toBeInTheDocument();
  });

  it('shows the empty state when there are no items', async () => {
    server.use(
      http.get(`${env.apiUrl}/api/v1/notifications`, () =>
        HttpResponse.json({ items: [], total: 0, unread: 0 }),
      ),
    );

    await signIn();
    renderRoute(paths.homeNotifications);

    expect(await screen.findByText('Нет новых уведомлений')).toBeInTheDocument();
  });

  it('shows a load-error message distinct from the empty state on a failed fetch', async () => {
    let fail = true;
    server.use(
      http.get(`${env.apiUrl}/api/v1/notifications`, () =>
        fail
          ? HttpResponse.json(
              { code: 'server_error', message: 'boom', details: null },
              { status: 500 },
            )
          : HttpResponse.json({ items: [], total: 0, unread: 0 }),
      ),
    );

    await signIn();
    renderRoute(paths.homeNotifications);

    expect(await screen.findByText('Не удалось загрузить уведомления')).toBeInTheDocument();
    expect(screen.queryByText('Нет новых уведомлений')).not.toBeInTheDocument();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByText('Нет новых уведомлений')).toBeInTheDocument();
  });

  it('ведёт с уведомления о запросе на связь на экран запросов', async () => {
    // Уведомление о заявке требует ответа, но по нему некуда было нажать —
    // человек читал текст и уходил искать экран сам.
    server.use(
      http.get(`${env.apiUrl}/api/v1/notifications`, () =>
        HttpResponse.json({
          items: [
            {
              id: 'n3',
              type: 'link_request',
              title: 'Тренер хочет добавить вас',
              body: 'Откройте запросы, чтобы принять или отклонить.',
              payload: null,
              is_read: false,
              created_at: '2026-06-03T10:00:00Z',
            },
          ],
          total: 1,
          unread: 1,
        }),
      ),
    );

    await signIn();
    renderRoute(paths.homeNotifications);

    const card = await screen.findByRole('button', { name: /Тренер хочет добавить вас/ });
    fireEvent.click(card);

    // Клиентский вид экрана связей — заголовок «Мой тренер».
    expect(await screen.findByText('Мой тренер')).toBeInTheDocument();
  });

  it('оставляет некликабельными уведомления, которым некуда вести', async () => {
    server.use(http.get(`${env.apiUrl}/api/v1/notifications`, () => HttpResponse.json(PAGE)));

    await signIn();
    renderRoute(paths.homeNotifications);

    await screen.findByText('Подписка активна');
    // Единственная кнопка на экране — «Отметить все прочитанными».
    expect(screen.queryByRole('button', { name: /Подписка активна/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Системное/ })).not.toBeInTheDocument();
  });

  it('помечает уведомление прочитанным при переходе по нему', async () => {
    // Человек тапнул по уведомлению и разобрался с ним — оно не должно
    // остаться непрочитанным и снова висеть на счётчике.
    const marked: string[][] = [];
    server.use(
      http.get(`${env.apiUrl}/api/v1/notifications`, () =>
        HttpResponse.json({
          items: [
            {
              id: 'n4',
              type: 'link_request',
              title: 'Тренер хочет добавить вас',
              body: 'Откройте запросы, чтобы принять или отклонить.',
              payload: null,
              is_read: false,
              created_at: '2026-06-03T10:00:00Z',
            },
          ],
          total: 1,
          unread: 1,
        }),
      ),
      http.post(`${env.apiUrl}/api/v1/notifications/read`, async ({ request }) => {
        const body = (await request.json()) as { notification_ids: string[] };
        marked.push(body.notification_ids);
        return HttpResponse.json({ ok: true });
      }),
    );

    await signIn();
    renderRoute(paths.homeNotifications);

    fireEvent.click(await screen.findByRole('button', { name: /Тренер хочет добавить вас/ }));

    // Переход состоялся…
    expect(await screen.findByText('Мой тренер')).toBeInTheDocument();
    // …и пометка ушла ровно по этому id.
    await waitFor(() => expect(marked).toEqual([['n4']]));
  });

  it('не шлёт пометку по уже прочитанному уведомлению, но переход делает', async () => {
    let markCalls = 0;
    server.use(
      http.get(`${env.apiUrl}/api/v1/notifications`, () =>
        HttpResponse.json({
          items: [
            {
              id: 'n5',
              type: 'link_request',
              title: 'Тренер хочет добавить вас',
              body: 'Откройте запросы, чтобы принять или отклонить.',
              payload: null,
              is_read: true,
              created_at: '2026-06-03T10:00:00Z',
            },
          ],
          total: 1,
          unread: 0,
        }),
      ),
      http.post(`${env.apiUrl}/api/v1/notifications/read`, () => {
        markCalls += 1;
        return HttpResponse.json({ ok: true });
      }),
    );

    await signIn();
    renderRoute(paths.homeNotifications);

    fireEvent.click(await screen.findByRole('button', { name: /Тренер хочет добавить вас/ }));

    expect(await screen.findByText('Мой тренер')).toBeInTheDocument();
    expect(markCalls).toBe(0);
  });

  it('не срывает переход, когда пометка падает с ошибкой сети', async () => {
    server.use(
      http.get(`${env.apiUrl}/api/v1/notifications`, () =>
        HttpResponse.json({
          items: [
            {
              id: 'n6',
              type: 'link_request',
              title: 'Тренер хочет добавить вас',
              body: 'Откройте запросы, чтобы принять или отклонить.',
              payload: null,
              is_read: false,
              created_at: '2026-06-03T10:00:00Z',
            },
          ],
          total: 1,
          unread: 1,
        }),
      ),
      http.post(`${env.apiUrl}/api/v1/notifications/read`, () =>
        HttpResponse.json(
          { code: 'server_error', message: 'boom', details: null },
          { status: 500 },
        ),
      ),
    );

    await signIn();
    renderRoute(paths.homeNotifications);

    fireEvent.click(await screen.findByRole('button', { name: /Тренер хочет добавить вас/ }));

    expect(await screen.findByText('Мой тренер')).toBeInTheDocument();
  });

  it('marks all read via POST /notifications/read-all when there are unread items', async () => {
    let calledReadAll = false;
    server.use(
      http.get(`${env.apiUrl}/api/v1/notifications`, () => HttpResponse.json(PAGE)),
      http.post(`${env.apiUrl}/api/v1/notifications/read-all`, () => {
        calledReadAll = true;
        return HttpResponse.json({ ok: true });
      }),
    );

    await signIn();
    renderRoute(paths.homeNotifications);

    const button = await screen.findByRole('button', { name: /прочитан/i });
    button.click();

    await waitFor(() => expect(calledReadAll).toBe(true));
  });
});
