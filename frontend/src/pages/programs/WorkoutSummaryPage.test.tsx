import { Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { shareResultImage } from '@/features/share-result/shareResultImage';
import { sessionSummaryKey } from '@/entities/workout/api/use-session-summary';
import { server } from '@/app/mocks/server';
import type { components } from '@/shared/api/schema';
import { paths, workoutSummary } from '@/shared/config/paths';
import { env } from '@/shared/config/env';
import { resetNetworkStatusForTests } from '@/shared/lib/network/useNetworkStatus';
import { WorkoutSummaryPage, WorkoutSummaryView } from './WorkoutSummaryPage';
vi.mock('@/features/share-result/shareResultImage', () => ({
  shareResultImage: vi.fn(async () => 'shared'),
}));
// Итоги подписывают вес единицей из настроек, а настройки читаются через
// react-query — как и в приложении, экран рендерится внутри провайдера.
function renderSummary(ui: ReactNode, seed?: (qc: QueryClient) => void) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  seed?.(qc);
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}
function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}
const summary: components['schemas']['SessionSummaryOut'] = {
  session_id: 's1',
  seq_number: 42,
  finished_at: '2026-06-16T10:30:00Z',
  duration_seconds: 1800,
  avg_rest_seconds: 90,
  exercises: [
    {
      name: 'Жим лёжа',
      max: { value: 70, delta: 10 },
      avg: { value: 65, delta: 10 },
      min: { value: 60, delta: 10 },
    },
  ],
};
afterEach(() => {
  vi.restoreAllMocks();
  resetNetworkStatusForTests();
});
describe('WorkoutSummaryView', () => {
  beforeEach(() => {
    vi.mocked(shareResultImage).mockClear();
  });
  it('checks average rest and sharing independently', () => {
    renderSummary(
      <MemoryRouter>
        <WorkoutSummaryView summary={summary} premium averageRest={false} />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole('button', { name: 'Среднее время отдыха · Premium' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Поделиться результатом' })).toBeEnabled();
  });
  it('keeps sharing restrictions explainable while average rest is available', async () => {
    renderSummary(
      <MemoryRouter>
        <WorkoutSummaryView summary={summary} premium={false} averageRest />
      </MemoryRouter>,
    );
    expect(screen.getByText('1:30')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Поделиться результатом · Premium' }));
    expect(screen.getByRole('link', { name: 'Подробнее о Premium' })).toHaveAttribute(
      'href',
      paths.settingsSubscription,
    );
    expect(shareResultImage).not.toHaveBeenCalled();
  });
  it('does not label unknown rights as Premium restrictions', () => {
    renderSummary(
      <MemoryRouter>
        <WorkoutSummaryView summary={summary} premium={null} averageRest={null} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: 'Проверяем доступ…' })).toBeDisabled();
    expect(screen.queryByText('Premium')).not.toBeInTheDocument();
  });
  it('renders title with seq number and exercise', () => {
    renderSummary(
      <MemoryRouter>
        <WorkoutSummaryView summary={summary} isOnline />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Итоги тренировки #42/)).toBeInTheDocument();
    // The visible summary renders the exercise as a heading; the off-screen
    // (aria-hidden) share card renders the same name as a plain div, so scope
    // to the heading to avoid a duplicate-match.
    expect(screen.getByRole('heading', { name: 'Жим лёжа' })).toBeInTheDocument();
    // Колонки MAX/AVG/MIN подписаны единицей веса (по умолчанию метрической).
    expect(screen.getByText(/^70 кг$/)).toBeInTheDocument();
  });
  it('renders an hour-long duration as H:MM:SS, not M:SS', () => {
    // 7505s = 2h 5m 5s. Must render as "2:05:05", never the wrapped "125:05".
    const longSummary: components['schemas']['SessionSummaryOut'] = {
      ...summary,
      duration_seconds: 7505,
      avg_rest_seconds: 3725, // 1:02:05
    };
    renderSummary(
      <MemoryRouter>
        <WorkoutSummaryView summary={longSummary} isOnline />
      </MemoryRouter>,
    );
    expect(screen.getByText('2:05:05')).toBeInTheDocument();
    expect(screen.queryByText('125:05')).not.toBeInTheDocument();
    expect(screen.getByText('1:02:05')).toBeInTheDocument();
  });
  it('shares the result card when the share button is clicked', async () => {
    renderSummary(
      <MemoryRouter>
        <WorkoutSummaryView summary={summary} isOnline />
      </MemoryRouter>,
    );
    // The heavy off-screen result card (rendering the "DopaFit" wordmark) is not
    // mounted at rest — only during a share action.
    expect(screen.queryByText('DopaFit')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Поделиться результатом' }));
    await waitFor(() => expect(shareResultImage).toHaveBeenCalledTimes(1));
  });
  it('keeps the share button enabled offline', () => {
    renderSummary(
      <MemoryRouter>
        <WorkoutSummaryView summary={summary} isOnline={false} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: 'Поделиться результатом' })).toBeEnabled();
  });
  it('navigates to another tab through browser history', async () => {
    renderSummary(
      <MemoryRouter>
        <WorkoutSummaryView summary={summary} />
        <LocationProbe />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'На главную' }));
    expect(screen.getByTestId('location')).toHaveTextContent(paths.home);
    await userEvent.click(screen.getByRole('button', { name: 'Сделать замеры' }));
    expect(screen.getByTestId('location')).toHaveTextContent(paths.measurements);
  });
});
describe('WorkoutSummaryPage browser navigation', () => {
  beforeEach(() => {
    server.use(
      http.get(`${env.apiUrl}/api/v1/workouts/sessions/:sessionId/summary`, () =>
        HttpResponse.json(summary),
      ),
    );
  });
  it('unmounts the summary when leaving and renders the programs root', async () => {
    renderSummary(
      <MemoryRouter initialEntries={[{ pathname: workoutSummary('s1'), state: { summary } }]}>
        <Routes>
          <Route path={workoutSummary(':sessionId')} element={<WorkoutSummaryPage />} />
          <Route path={paths.home} element={<div>Главный экран</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText(/Итоги тренировки #42/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'На главную' }));
    expect(screen.getByText('Главный экран')).toBeInTheDocument();
    expect(screen.queryByText(/Итоги тренировки #42/)).not.toBeInTheDocument();
  });
  it('loads the summary from its URL without navigation state', async () => {
    renderSummary(
      <MemoryRouter initialEntries={[workoutSummary('s1')]}>
        <Routes>
          <Route path={workoutSummary(':sessionId')} element={<WorkoutSummaryPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText(/Итоги тренировки #42/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Жим лёжа' })).toBeInTheDocument();
  });
  it('hides a summary when the server denies access', async () => {
    server.use(
      http.get(`${env.apiUrl}/api/v1/workouts/sessions/:sessionId/summary`, () =>
        HttpResponse.json({ code: 'not_found', message: 'Session not found' }, { status: 404 }),
      ),
    );
    renderSummary(
      <MemoryRouter initialEntries={[{ pathname: workoutSummary('s1'), state: { summary } }]}>
        <Routes>
          <Route path={workoutSummary(':sessionId')} element={<WorkoutSummaryPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('Итоги недоступны')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Жим лёжа' })).not.toBeInTheDocument();
  });
  it('does not reveal a cached summary when access has been revoked', async () => {
    server.use(
      http.get(`${env.apiUrl}/api/v1/workouts/sessions/:sessionId/summary`, () =>
        HttpResponse.json({ code: 'not_found', message: 'Session not found' }, { status: 404 }),
      ),
    );
    renderSummary(
      <MemoryRouter initialEntries={[workoutSummary('s1')]}>
        <Routes>
          <Route path={workoutSummary(':sessionId')} element={<WorkoutSummaryPage />} />
        </Routes>
      </MemoryRouter>,
      (qc) => qc.setQueryData(sessionSummaryKey('s1'), summary),
    );
    expect(screen.queryByRole('heading', { name: 'Жим лёжа' })).not.toBeInTheDocument();
    expect(await screen.findByText('Итоги недоступны')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Жим лёжа' })).not.toBeInTheDocument();
  });
  it('shows the just-finished local summary while offline', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    resetNetworkStatusForTests();
    renderSummary(
      <MemoryRouter initialEntries={[{ pathname: workoutSummary('s1'), state: { summary } }]}>
        <Routes>
          <Route path={workoutSummary(':sessionId')} element={<WorkoutSummaryPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText(/Итоги тренировки #42/)).toBeInTheDocument();
  });
});
