import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { useSessionStore } from '@/entities/session/model/store';
import { resetNetworkStatusForTests } from '@/shared/lib/network/useNetworkStatus';
import { env } from '@/shared/config/env';
import { paths, supportThread } from '@/shared/config/paths';
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

const TICKETS = [
  {
    id: 't1',
    subject: 'Не сохраняется тренировка',
    message: 'Помогите, тренировка не сохраняется офлайн.',
    status: 'answered',
    created_at: '2026-06-01T10:00:00Z',
  },
  {
    id: 't2',
    subject: 'Вопрос по подписке',
    message: 'Как продлить премиум?',
    status: 'open',
    created_at: '2026-06-02T10:00:00Z',
  },
];

const TICKET_DETAIL = {
  ...TICKETS[0],
  replies: [
    {
      id: 'r1',
      author: 'admin',
      body: 'Здравствуйте! Уже разбираемся с вашей проблемой.',
      created_at: '2026-06-01T12:00:00Z',
    },
  ],
};

describe('support screens', () => {
  beforeEach(async () => {
    await useSessionStore.getState().clearSession();
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
    resetNetworkStatusForTests();
    onlineManager.setOnline(true);
  });

  it('disables submit until both fields filled, then posts and shows success', async () => {
    let posted: { subject: string; message: string } | null = null;
    server.use(
      http.post(`${env.apiUrl}/api/v1/support/tickets`, async ({ request }) => {
        posted = (await request.json()) as { subject: string; message: string };
        return HttpResponse.json({
          id: 't9',
          subject: posted.subject,
          message: posted.message,
          status: 'open',
          created_at: '2026-06-28T10:00:00Z',
        });
      }),
    );

    await signIn();
    renderRoute(paths.support);

    const submit = await screen.findByRole('button', { name: 'Отправить' });
    expect(submit).toBeDisabled();

    fireEvent.input(screen.getByLabelText('Тема обращения'), {
      target: { value: 'Проблема с входом' },
    });
    expect(submit).toBeDisabled();

    fireEvent.input(screen.getByLabelText('Сообщение'), {
      target: { value: 'Не приходит код подтверждения.' },
    });
    expect(submit).not.toBeDisabled();

    fireEvent.click(submit);

    // Online the ticket really reached the server, so the screen keeps the original
    // wording — and must NOT fall back to the offline "saved on device" copy.
    expect(await screen.findByText('Спасибо за обращение!')).toBeInTheDocument();
    expect(screen.getByText('Ответим в ближайшее время')).toBeInTheDocument();
    expect(screen.queryByText('Обращение сохранено')).not.toBeInTheDocument();
    await waitFor(() => expect(posted).not.toBeNull());
    expect(posted).toEqual({
      subject: 'Проблема с входом',
      message: 'Не приходит код подтверждения.',
    });
  });

  it('offline: confirms the ticket is QUEUED (not answered) without hanging the submit button', async () => {
    let postCount = 0;
    server.use(
      http.post(`${env.apiUrl}/api/v1/support/tickets`, () => {
        postCount += 1;
        return HttpResponse.json({
          id: 't9',
          subject: 's',
          message: 'm',
          status: 'open',
          created_at: '2026-06-28T10:00:00Z',
        });
      }),
    );

    await signIn();
    // Drive BOTH signals offline: useNetworkStatus reads navigator.onLine (guards
    // the UI branch), and onlineManager pauses the outbox-backed mutation.
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
    resetNetworkStatusForTests();
    onlineManager.setOnline(false);
    renderRoute(paths.support);

    fireEvent.input(await screen.findByLabelText('Тема обращения'), {
      target: { value: 'Офлайн-тема' },
    });
    fireEvent.input(screen.getByLabelText('Сообщение'), {
      target: { value: 'Отправлю позже.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));

    // The outbox-backed mutation pauses offline; the flow must confirm instead of
    // spinning forever, and it must NOT have hit the network yet. (The next test's
    // beforeEach restores onlineManager; the queued mutation stays paused here so it
    // never fires an unhandled request against a torn-down scoped handler.)
    //
    // The confirmation must be truthful: the ticket is still on the device, so the
    // screen says it is saved and will be sent on reconnect. The online-only
    // wording ("Спасибо за обращение!" / "Ответим в ближайшее время") would promise
    // a reply for something the server has never seen, and the toast that says
    // otherwise disappears after 2.5s while this screen stays.
    expect(await screen.findByText('Обращение сохранено')).toBeInTheDocument();
    expect(screen.getByText('Отправится при подключении к сети')).toBeInTheDocument();
    expect(screen.queryByText('Спасибо за обращение!')).not.toBeInTheDocument();
    expect(screen.queryByText('Ответим в ближайшее время')).not.toBeInTheDocument();
    expect(postCount).toBe(0);
  });

  it('renders the list of tickets with their statuses', async () => {
    server.use(
      http.get(`${env.apiUrl}/api/v1/support/tickets`, () => HttpResponse.json(TICKETS)),
    );

    await signIn();
    renderRoute(paths.supportList);

    expect(await screen.findByText('Не сохраняется тренировка')).toBeInTheDocument();
    expect(screen.getByText('Вопрос по подписке')).toBeInTheDocument();
    expect(screen.getByText('Отвечено')).toBeInTheDocument();
    expect(screen.getByText('Открыт')).toBeInTheDocument();
  });

  it('resolves /support/list to the list, not the thread', async () => {
    server.use(
      http.get(`${env.apiUrl}/api/v1/support/tickets`, () => HttpResponse.json(TICKETS)),
    );

    await signIn();
    renderRoute(paths.supportList);

    // The list heading/tickets render; the thread's reply box must NOT appear.
    expect(await screen.findByText('Не сохраняется тренировка')).toBeInTheDocument();
    expect(screen.queryByLabelText('Ваш ответ')).not.toBeInTheDocument();
  });

  it('shows the thread with original message and replies, and posts a reply', async () => {
    let repliedBody: string | null = null;
    server.use(
      http.get(`${env.apiUrl}/api/v1/support/tickets/t1`, () =>
        HttpResponse.json(TICKET_DETAIL),
      ),
      http.post(`${env.apiUrl}/api/v1/support/tickets/t1/replies`, async ({ request }) => {
        repliedBody = ((await request.json()) as { body: string }).body;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await signIn();
    renderRoute(supportThread('t1'));

    expect(
      await screen.findByText('Помогите, тренировка не сохраняется офлайн.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Здравствуйте! Уже разбираемся с вашей проблемой.'),
    ).toBeInTheDocument();

    fireEvent.input(screen.getByLabelText('Ваш ответ'), {
      target: { value: 'Спасибо, жду!' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));

    await waitFor(() => expect(repliedBody).toBe('Спасибо, жду!'));
  });
});
