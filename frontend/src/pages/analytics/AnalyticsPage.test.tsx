import { setMockSubscription } from '@/entities/subscription/api/mocks';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it } from 'vitest';

import { useSessionStore } from '@/entities/session/model/store';
import { server } from '@/app/mocks/server';

import { AnalyticsPage } from './AnalyticsPage';

function renderPage(initialEntry = '/analytics') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <QueryClientProvider client={qc}>
        <AnalyticsPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function asClient() {
  useSessionStore.setState({
    user: { id: 'u1', role: 'client' } as never,
    isAuthenticated: true,
  });
}

// Центральное требование макета: в режиме «по программе/дню» каждое упражнение
// дня получает СВОЮ карточку с графиком, а не одну усреднённую на всех.
it('renders one chart card per exercise of the day', async () => {
  asClient();
  renderPage();
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: /Жим лёжа/ })).toBeInTheDocument(),
  );
  expect(screen.getByRole('heading', { name: /Подтягивания/ })).toBeInTheDocument();
  // По карточке на упражнение — значит и «Общее кол-во» столько же.
  expect(screen.getAllByText('Общее кол-во')).toHaveLength(2);
});

// Выбор упражнения сужает выдачу до одного — запрос уходит с exercise_id.
// Проверяем именно ЗАГОЛОВКИ карточек: название упражнения есть ещё и в
// выпадающем списке выбора, и поиск по тексту нашёл бы <option>.
it('charts a single exercise in "По упражнению" mode', async () => {
  asClient();
  renderPage('/analytics?view=exercise&exercise=ex-bench');
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: /Жим лёжа/ })).toBeInTheDocument(),
  );
  expect(screen.queryByRole('heading', { name: /Подтягивания/ })).not.toBeInTheDocument();
});

// Вкладки переключают весь экран, а не добавляют второй блок.
it('switches between the workouts and anthropometry tabs', async () => {
  asClient();
  renderPage();
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: /Жим лёжа/ })).toBeInTheDocument(),
  );

  fireEvent.click(screen.getByRole('tab', { name: 'Антропометрия' }));

  await waitFor(() => expect(screen.getByText('График измерений')).toBeInTheDocument());
  // Карточки тренировок ушли вместе с вкладкой.
  expect(screen.queryByRole('heading', { name: /Жим лёжа/ })).not.toBeInTheDocument();
  expect(screen.getByText('Сравнение фотографий прогресса')).toBeInTheDocument();
});

// Конструктора графиков больше нет — по макету настройки живут на самой странице.
it('has no chart constructor popup', async () => {
  asClient();
  renderPage();
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: /Жим лёжа/ })).toBeInTheDocument(),
  );
  expect(screen.queryByText('Настроить')).not.toBeInTheDocument();
});

// Состояние экрана читается из URL, поэтому ссылкой можно поделиться.
it('restores the selected tab and period from the URL', async () => {
  asClient();
  renderPage('/analytics?tab=anthropometry&from=2026-01-01&to=2026-03-01');
  await waitFor(() => expect(screen.getByText('График измерений')).toBeInTheDocument());
  expect(screen.getByLabelText('Период анализа: начало')).toHaveValue('2026-01-01');
  expect(screen.getByLabelText('Период анализа: конец')).toHaveValue('2026-03-01');
  expect(screen.getByText('01.01.2026')).toBeInTheDocument();
  expect(screen.getByText('01.03.2026')).toBeInTheDocument();
  await waitFor(() => expect(screen.getByLabelText('Было')).toHaveTextContent('1 апреля 2026'));
  expect(screen.getByLabelText('Было')).not.toHaveTextContent('2026-04-01');
});

// Приватность: фото клиента не видны тренеру, и приватный эндпоинт не зовётся.
it('keeps client progress photos hidden from a trainer', async () => {
  let compareCalls = 0;
  server.use(
    http.get('**/api/v1/analytics/photos/compare', () => {
      compareCalls += 1;
      return new HttpResponse(null, { status: 403 });
    }),
  );
  useSessionStore.setState({
    user: { id: 'tr1', role: 'trainer' } as never,
    isAuthenticated: true,
  });
  renderPage('/analytics?tab=anthropometry');

  await waitFor(() => expect(screen.getByText('График измерений')).toBeInTheDocument());
  expect(screen.getByText('Сравнение фотографий прогресса')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('tab', { name: 'Клиенты' }));

  await waitFor(() =>
    expect(screen.queryByText('Сравнение фотографий прогресса')).not.toBeInTheDocument(),
  );
  expect(compareCalls).toBe(0);
});

// Тренеру доступен выбор клиента; обычному пользователю этот переключатель не нужен.
it('shows the data-source switch to a trainer only', async () => {
  asClient();
  const { unmount } = renderPage();
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: /Жим лёжа/ })).toBeInTheDocument(),
  );
  expect(screen.queryByRole('tab', { name: 'Клиенты' })).not.toBeInTheDocument();
  unmount();

  useSessionStore.setState({
    user: { id: 'tr1', role: 'trainer' } as never,
    isAuthenticated: true,
  });
  renderPage();
  await waitFor(() => expect(screen.getByRole('tab', { name: 'Клиенты' })).toBeInTheDocument());
});

// Последний выбранный замер не снимается: пустой выбор дал бы пустой график
// без объяснения, почему он пуст.
it('keeps at least one measurement selected', async () => {
  asClient();
  renderPage('/analytics?tab=anthropometry');
  await waitFor(() => expect(screen.getByText('График измерений')).toBeInTheDocument());

  const weight = await screen.findByRole('button', { name: 'Вес', pressed: true });
  fireEvent.click(weight);

  expect(screen.getByRole('button', { name: 'Вес' })).toHaveAttribute('aria-pressed', 'true');
});

beforeEach(() =>
  setMockSubscription({
    is_active: true,
    ends_at: '2099-01-01T00:00:00Z',
    entitlements: undefined,
  }),
);
