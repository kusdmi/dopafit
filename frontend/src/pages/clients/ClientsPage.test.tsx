import { AppFrame } from '@/shared/ui/primitives';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { expect, it } from 'vitest';

import { useSessionStore } from '@/entities/session/model/store';
import { paths } from '@/shared/config/paths';

import { ClientsPage } from './ClientsPage';
import { TrainerClientsView } from './TrainerClientsView';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AppFrame>
        <MemoryRouter>
          <ClientsPage />
        </MemoryRouter>
      </AppFrame>
    </QueryClientProvider>,
  );
}

function renderRoster() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AppFrame>
        <MemoryRouter>
          <TrainerClientsView />
        </MemoryRouter>
      </AppFrame>
    </QueryClientProvider>,
  );
}

it('shows the roster and Add button for a trainer', async () => {
  useSessionStore.setState({ user: { id: 'u1', role: 'trainer' } as never, isAuthenticated: true });
  renderPage();
  await waitFor(() => expect(screen.getByText('Добавить клиента')).toBeInTheDocument());
  expect(screen.getByText('Вася')).toBeInTheDocument();
  // Combined badge: the stub client (client_user_id null) reads "Мой"; the linked one "Активный".
  expect(screen.getByText('Мой')).toBeInTheDocument();
  expect(screen.getByText('Активный')).toBeInTheDocument();
  // Вася has injuries → the injury indicator is shown; Анна (no injuries) has none.
  const injuryBadges = screen.getAllByLabelText('Есть ограничения по здоровью');
  expect(injuryBadges).toHaveLength(1);
});

it('shows two segments and switches to the requests tab (trainer)', async () => {
  useSessionStore.setState({ user: { id: 'u1', role: 'trainer' } as never, isAuthenticated: true });
  renderPage();

  expect(await screen.findByRole('tab', { name: 'Мои клиенты' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Запросы' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('tab', { name: 'Запросы' }));

  // RequestList (incoming) renders the "Принять" action for a pending incoming request —
  // a target unique to the requests tab (the seeded incoming link request is pending).
  expect(await screen.findByRole('button', { name: 'Принять' })).toBeInTheDocument();
});

it('показывает тренеру и входящие, и отправленные запросы', async () => {
  // Раньше вкладка «Запросы» рендерила только direction="incoming": отправив
  // запрос клиенту, тренер терял его из виду и не мог отменить.
  useSessionStore.setState({ user: { id: 'u1', role: 'trainer' } as never, isAuthenticated: true });
  renderPage();

  fireEvent.click(await screen.findByRole('tab', { name: 'Запросы' }));

  expect(await screen.findByRole('heading', { name: 'Входящие' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Отправленные' })).toBeInTheDocument();
  // Входящая заявка даёт «Принять», исходящая — «Отменить запрос»; вторая
  // кнопка и есть то, чего у тренера не было.
  expect(await screen.findByRole('button', { name: 'Принять' })).toBeInTheDocument();
  expect(await screen.findByRole('button', { name: 'Отменить запрос' })).toBeInTheDocument();
});

it('groups active/archived in the main list and unlinked under Бывшие клиенты', async () => {
  const { api } = await import('@/shared/api/client');
  await api.POST('/api/v1/clients/{client_id}/archive', {
    params: { path: { client_id: 'client-stub-1' } },
  });
  await api.POST('/api/v1/clients/{client_id}/unlink', {
    params: { path: { client_id: 'client-linked-1' } },
  });
  renderRoster();
  await waitFor(() => expect(screen.getByText('Бывшие клиенты')).toBeInTheDocument());
  // Анна (unlinked) appears; Вася (archived) is in the main list (still rendered)
  expect(screen.getByText('Анна Клиентова')).toBeInTheDocument();
  expect(screen.getByText('Вася')).toBeInTheDocument();
});

it('shows request tabs for a client', async () => {
  useSessionStore.setState({ user: { id: 'u2', role: 'client' } as never, isAuthenticated: true });
  renderPage();
  await waitFor(() => expect(screen.getByText('Запросы от тренера')).toBeInTheDocument());
});

it('предлагает клиенту без тренера найти его', async () => {
  useSessionStore.setState({ user: { id: 'u2', role: 'client' } as never, isAuthenticated: true });
  renderPage();

  expect(await screen.findByText('У вас пока нет тренера')).toBeInTheDocument();
  expect(screen.getByText('Тренер уже есть в приложении?')).toBeInTheDocument();
});

it('показывает связанного тренера вместо пустого состояния', async () => {
  // Экран рендерил «У вас пока нет тренера» безусловно: приняв запрос, клиент
  // навсегда читал, что тренера нет, — обновление страницы ничего не меняло,
  // потому что состояние связи вообще не запрашивалось.
  const { setMyTrainer } = await import('@/entities/client/api/mocks');
  setMyTrainer({
    card_id: 'card-1',
    trainer_user_id: 'trainer-1',
    full_name: 'Пётр Тренер',
    phone: '+79990001122',
    linked_since: '2026-02-01',
  });
  useSessionStore.setState({ user: { id: 'u2', role: 'client' } as never, isAuthenticated: true });
  renderPage();

  expect(await screen.findByText('Пётр Тренер')).toBeInTheDocument();
  expect(screen.getByText('Работаете вместе с 1 февраля 2026')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '+7 999 000 11 22' })).toHaveAttribute(
    'href',
    'tel:+79990001122',
  );
  // Пустое состояние и форма поиска при этом уходят целиком.
  expect(screen.queryByText('У вас пока нет тренера')).not.toBeInTheDocument();
  expect(screen.queryByText('Тренер уже есть в приложении?')).not.toBeInTheDocument();
  // Заявки остаются: их история видна в обоих состояниях.
  expect(screen.getByText('Ваши заявки')).toBeInTheDocument();
});

it('возвращает клиента к пустому состоянию после отвязки', async () => {
  const { setMyTrainer } = await import('@/entities/client/api/mocks');
  setMyTrainer({
    card_id: 'card-1',
    trainer_user_id: 'trainer-1',
    full_name: 'Пётр Тренер',
    phone: null,
    linked_since: '2026-02-01',
  });
  useSessionStore.setState({ user: { id: 'u2', role: 'client' } as never, isAuthenticated: true });
  const { unmount } = renderPage();
  expect(await screen.findByText('Пётр Тренер')).toBeInTheDocument();

  // Отвязывает тренер со своей стороны; клиент видит результат при следующем
  // запросе — поэтому перемонтируем экран с чистым кэшем, как при возврате.
  const { api } = await import('@/shared/api/client');
  await api.POST('/api/v1/clients/{client_id}/unlink', {
    params: { path: { client_id: 'client-linked-1' } },
  });
  unmount();
  renderPage();

  expect(await screen.findByText('У вас пока нет тренера')).toBeInTheDocument();
  expect(screen.queryByText('Пётр Тренер')).not.toBeInTheDocument();
});

// Связь обоюдная: клиент должен уметь выйти из неё сам, не дожидаясь тренера.
it('позволяет клиенту отвязаться от тренера', async () => {
  const { setMyTrainer } = await import('@/entities/client/api/mocks');
  setMyTrainer({
    card_id: 'client-linked-1',
    trainer_user_id: 'trainer-1',
    full_name: 'Пётр Тренер',
    phone: null,
    linked_since: '2026-02-01',
  });
  useSessionStore.setState({ user: { id: 'u2', role: 'client' } as never, isAuthenticated: true });
  renderPage();
  expect(await screen.findByText('Пётр Тренер')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Отвязаться от тренера' }));

  // Подтверждение обязательно: действие необратимо в один тап.
  expect(await screen.findByText('Отвязаться от тренера?')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Отвязаться' }));

  await waitFor(() => expect(screen.getByText('У вас пока нет тренера')).toBeInTheDocument());
  expect(screen.queryByText('Пётр Тренер')).not.toBeInTheDocument();
});

it('открывает вкладку «Запросы» по query-параметру из push-уведомления', async () => {
  // Тап по системному пушу приходит через service worker, а тот умеет только
  // URL: при закрытом приложении он зовёт openWindow(url), и state истории там
  // взяться неоткуда. Вкладку поэтому несёт `?tab=requests`, который кладёт
  // backend (modules/messaging/domain/push-target.ts) — без чтения здесь это
  // был бы мёртвый параметр.
  useSessionStore.setState({ user: { id: 'u1', role: 'trainer' } as never, isAuthenticated: true });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <AppFrame>
        <MemoryRouter initialEntries={[`${paths.connections}?tab=requests`]}>
          <Routes>
            <Route path={paths.connections} element={<ClientsPage />} />
          </Routes>
        </MemoryRouter>
      </AppFrame>
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('button', { name: 'Принять' })).toBeInTheDocument();
});
