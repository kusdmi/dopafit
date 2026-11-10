import { AppFrame } from '@/shared/ui/primitives';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { resetCalendarStore } from '@/entities/calendar/api/mocks';
import { useSessionStore } from '@/entities/session/model/store';

import { CalendarPage } from './CalendarPage';

const networkStatus = { isOnline: true, isOffline: false };
vi.mock('@/shared/lib/network/useNetworkStatus', () => ({
  useNetworkStatus: () => networkStatus,
}));

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  // Seed events anchor to "now"; pin to June 2026 so the seeded month is loaded.
  vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
  // Re-seed AFTER the clock is mocked: the module-load seed() ran against real
  // time (wrong month), so re-anchor the store to the mocked June date.
  resetCalendarStore();
});

afterEach(() => {
  vi.useRealTimers();
  networkStatus.isOnline = true;
  networkStatus.isOffline = false;
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <AppFrame>
        <MemoryRouter>
          <CalendarPage />
        </MemoryRouter>
      </AppFrame>
    </QueryClientProvider>,
  );
}

it('loads the month and shows stat cards for a trainer', async () => {
  useSessionStore.setState({ user: { id: 'u1', role: 'trainer' } as never, isAuthenticated: true });
  renderPage();
  await waitFor(() => expect(screen.getByText('Июнь 2026')).toBeInTheDocument());
  // Stat cards present (seeded month has 1 personal, 1 with_clients, 1 planned, 1 completed).
  // Wait for the data-dependent stat card before asserting the rest.
  await waitFor(() => expect(screen.getByText('Запланировано')).toBeInTheDocument());
  expect(screen.getByText('Проведено')).toBeInTheDocument();
  expect(screen.getByText('Клиентов')).toBeInTheDocument();
  // Trainer sees the "С клиентами" stat card (and never "С тренером").
  expect(screen.getAllByText('С клиентами').length).toBeGreaterThan(0);
  expect(screen.queryByText('С тренером')).not.toBeInTheDocument();
  expect(screen.getByText('Записать клиента')).toBeInTheDocument();
});

it('navigates between months', async () => {
  useSessionStore.setState({ user: { id: 'u1', role: 'trainer' } as never, isAuthenticated: true });
  renderPage();
  await waitFor(() => expect(screen.getByText('Июнь 2026')).toBeInTheDocument());
  await waitFor(() => expect(screen.getByText('Запланировано')).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Следующий месяц' }));
  await waitFor(() => expect(screen.getByText('Июль 2026')).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Предыдущий месяц' }));
  await waitFor(() => expect(screen.getByText('Июнь 2026')).toBeInTheDocument());
});

it('opens the view modal for a day with events', async () => {
  useSessionStore.setState({ user: { id: 'u1', role: 'trainer' } as never, isAuthenticated: true });
  renderPage();
  await waitFor(() => expect(screen.getByText('Июнь 2026')).toBeInTheDocument());
  await waitFor(() => expect(screen.getByText('Запланировано')).toBeInTheDocument());
  // Seed has a personal planned event on the 10th.
  fireEvent.click(screen.getByText('10'));
  // Признак открытого просмотра — заголовок дня, а не кнопка «Добавить
  // тренировку»: 10-е уже прошло (часы на 15-м), и на прошедший день не
  // записываются, поэтому кнопки там нет.
  await waitFor(() => expect(screen.getByText(/Тренировки на/)).toBeInTheDocument());
});

it('opens the booking modal for an empty day', async () => {
  useSessionStore.setState({ user: { id: 'u1', role: 'trainer' } as never, isAuthenticated: true });
  renderPage();
  await waitFor(() => expect(screen.getByText('Июнь 2026')).toBeInTheDocument());
  await waitFor(() => expect(screen.getByText('Запланировано')).toBeInTheDocument());
  // 25-е — будущий пустой день (часы теста стоят на 15 июня). Раньше здесь
  // было 5-е, но на прошедший день записаться нельзя, и его ячейка отключена.
  fireEvent.click(screen.getByText('25'));
  // У тренера заголовок «Записать клиента» (макет 392:4474) — он записывает
  // кого-то, а не себя; «Запись на тренировку» осталось за клиентом. Ищем
  // именно ЗАГОЛОВОК: на странице уже есть одноимённая кнопка, и обычный
  // getByText нашёл бы оба узла.
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: 'Записать клиента' })).toBeInTheDocument(),
  );
});

it('hides trainer-only UI and relabels the shared-session stat for a client', async () => {
  useSessionStore.setState({ user: { id: 'u2', role: 'client' } as never, isAuthenticated: true });
  renderPage();
  await waitFor(() => expect(screen.getByText('Июнь 2026')).toBeInTheDocument());
  // The with_clients stat is relabelled "С тренером" and stays visible (stat card + legend).
  await waitFor(() => expect(screen.getAllByText('С тренером').length).toBeGreaterThan(0));
  expect(screen.queryByText('Записать клиента')).not.toBeInTheDocument();
  // Trainer-only labels are absent for the client.
  expect(screen.queryByText('С клиентами')).not.toBeInTheDocument();
  expect(screen.queryByText('Клиентов')).not.toBeInTheDocument();
  // Shared month stats remain visible.
  expect(screen.getByText('Запланировано')).toBeInTheDocument();
  expect(screen.getByText('Проведено')).toBeInTheDocument();
});

// Отменённая запись остаётся в ответе месяца, но день не должен выглядеть
// занятым: точка означает «тут есть тренировка».
it('drops the marker from a day whose only event was cancelled', async () => {
  useSessionStore.setState({ user: { id: 'u1', role: 'client' } as never, isAuthenticated: true });
  renderPage();
  await waitFor(() => expect(screen.getByText('Июнь 2026')).toBeInTheDocument());

  // В моках 10-е — запланированная личная, 20-е — отменённая личная.
  const cell = (day: number) =>
    screen.getByRole('button', { name: new RegExp(`^${day}$`) });
  await waitFor(() =>
    expect(cell(10).querySelector('[data-indicator="personal"]')).toBeInTheDocument(),
  );
  expect(cell(20).querySelector('[data-indicator="personal"]')).toBeNull();
});

// Клик по такому дню — это «день свободен», а не «покажи отменённое».
it('treats a day with only a cancelled event as empty', async () => {
  useSessionStore.setState({ user: { id: 'u1', role: 'client' } as never, isAuthenticated: true });
  renderPage();
  await waitFor(() => expect(screen.getByText('Июнь 2026')).toBeInTheDocument());

  fireEvent.click(screen.getByRole('button', { name: /^20$/ }));

  // Открылась запись на тренировку, а не просмотр существующих.
  await waitFor(() =>
    expect(screen.queryByText(/Тренировки на/)).not.toBeInTheDocument(),
  );
});

// Запись «задним числом» закрыта: прошедший пустой день не открывает форму.
it('does not open the booking modal for a day that has passed', async () => {
  useSessionStore.setState({ user: { id: 'u1', role: 'trainer' } as never, isAuthenticated: true });
  renderPage();
  await waitFor(() => expect(screen.getByText('Июнь 2026')).toBeInTheDocument());
  await waitFor(() => expect(screen.getByText('Запланировано')).toBeInTheDocument());

  // 5 июня при часах на 15-м — прошедший день без записей.
  const past = screen.getByText('5').closest('button');
  expect(past).toBeDisabled();
  fireEvent.click(past!);

  expect(screen.queryByRole('heading', { name: 'Записать клиента' })).not.toBeInTheDocument();
});
