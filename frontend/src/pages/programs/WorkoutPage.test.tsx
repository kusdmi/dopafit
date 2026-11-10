import { setMockSubscription } from '@/entities/subscription/api/mocks';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, type ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useNavigation } from '@/shared/lib/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkoutStore } from '@/entities/workout/model/store';
import { workoutSummary } from '@/shared/config/paths';
import { WorkoutPage } from './WorkoutPage';
import { WorkoutSummaryPage } from './WorkoutSummaryPage';
// Offline forcing is opt-in per test via this mock; default stays online (real hook).
const networkStatus = { isOnline: true, isOffline: false };
vi.mock('@/shared/lib/network/useNetworkStatus', () => ({
  useNetworkStatus: () => networkStatus,
}));
function wrap(ui: ReactElement) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}
/** Mounts WorkoutPage plus a real summary route, so navigation lands somewhere assertable. */
function wrapWithSummaryRoute() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/workout']}>
        <Routes>
          <Route
            path="/workout"
            element={
              <>
                <WorkoutPage />
              </>
            }
          />
          <Route
            path={workoutSummary(':sessionId')}
            element={
              <>
                <WorkoutSummaryPage />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
describe('WorkoutPage', () => {
  beforeEach(() => {
    networkStatus.isOnline = true;
    networkStatus.isOffline = false;
    useWorkoutStore.getState().reset();
    useWorkoutStore.getState().startSession({
      participant: { kind: 'self' },
      programId: 'p1',
      dayId: 'd1',
      slots: [
        { slotId: 'sl1', variantId: 'v1', name: 'Жим лёжа', sets: 3, reps: 10, alternatives: [] },
      ],
    });
  });
  it('switches to the session that matches the program id in the URL', async () => {
    // Second parallel session for a different program (p2) while self/p1 is active.
    useWorkoutStore.getState().startSession({
      participant: { kind: 'client', clientId: 'c1', clientName: 'Клиент' },
      programId: 'p2',
      dayId: 'd2',
      slots: [
        { slotId: 'sl2', variantId: 'v2', name: 'Присед', sets: 3, reps: 8, alternatives: [] },
      ],
    });
    // self is the active session, but the URL points at program p2.
    useWorkoutStore.getState().switchTo('self');
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/app/programs/p2/session']}>
          <Routes>
            <Route
              path="/app/programs/:id/session"
              element={
                <>
                  <WorkoutPage />
                </>
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    // The page synced the active session to the URL's program, showing p2's slot.
    await waitFor(() => expect(screen.getByText('Присед')).toBeInTheDocument());
    expect(useWorkoutStore.getState().activeKey).toBe('client:c1');
    expect(screen.queryByText('Жим лёжа')).not.toBeInTheDocument();
  });
  it('tapping a tab for another program navigates and keeps that session active', async () => {
    // Two parallel sessions: self/p1 (seeded active) and a client on p2.
    useWorkoutStore.getState().startSession({
      participant: { kind: 'client', clientId: 'c1', clientName: 'Клиент' },
      programId: 'p2',
      dayId: 'd2',
      slots: [
        { slotId: 'sl2', variantId: 'v2', name: 'Присед', sets: 3, reps: 8, alternatives: [] },
      ],
    });
    useWorkoutStore.getState().switchTo('self');
    const ref: {
      history: ReturnType<typeof useNavigation> | null;
    } = { history: null };
    const Capture = () => {
      const h = useNavigation();
      useEffect(() => {
        ref.history = h;
      }, [h]);
      return null;
    };
    // Route matches p1 (self session), rendering the real session-scoped URL.
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/app/programs/p1/session']}>
          <Capture />
          <Routes>
            <Route
              path="/app/programs/:id/session"
              element={
                <>
                  <WorkoutPage />
                </>
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText('Жим лёжа')).toBeInTheDocument());
    const stackBefore = (
      ref.history as unknown as {
        length: number;
      }
    ).length;
    // Tapping the other program's tab must navigate to its URL and STICK — before
    // the fix the URL→store effect would immediately revert the switch.
    await userEvent.click(screen.getByText('Клиент'));
    await waitFor(() => expect(screen.getByText('Присед')).toBeInTheDocument());
    expect(useWorkoutStore.getState().activeKey).toBe('client:c1');
    expect(screen.queryByText('Жим лёжа')).not.toBeInTheDocument();
    // A lateral tab switch uses replace, so the history stack stays flat — Back
    // exits the workout screen instead of walking back through toggle entries.
    expect(
      (
        ref.history as unknown as {
          length: number;
        }
      ).length,
    ).toBe(stackBefore);
  });
  it('deep-link to a program with no session shows the empty state, not another session', async () => {
    // Only the self/p1 session exists; the URL points at p3 which has no session.
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/app/programs/p3/session']}>
          <Routes>
            <Route
              path="/app/programs/:id/session"
              element={
                <>
                  <WorkoutPage />
                </>
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    // The empty gate wins; the active (p1) session's exercise must NOT leak here.
    expect(screen.getByText('Нет активной тренировки')).toBeInTheDocument();
    expect(screen.queryByText('Жим лёжа')).not.toBeInTheDocument();
  });
  it('shows current exercise and logs a set', async () => {
    wrap(<WorkoutPage />);
    expect(screen.getByText('Жим лёжа')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('КГ'), '50');
    await userEvent.type(screen.getByLabelText('Повторы'), '10');
    await userEvent.click(screen.getByRole('button', { name: 'Добавить' }));
    expect(useWorkoutStore.getState().sessions.self.sets).toHaveLength(1);
  });
  it('renders real exercise details (description and steps) for the current exercise', async () => {
    // Re-seed with a slot whose exerciseId matches a mock exercise (ex-1).
    useWorkoutStore.getState().reset();
    useWorkoutStore.getState().startSession({
      participant: { kind: 'self' },
      programId: 'p1',
      dayId: 'd1',
      slots: [
        {
          slotId: 'sl1',
          variantId: 'v1',
          exerciseId: 'ex-1',
          name: 'Жим лёжа',
          sets: 3,
          reps: 10,
          alternatives: [],
        },
      ],
    });
    wrap(<WorkoutPage />);
    // The old placeholder must be gone.
    expect(screen.queryByText('Описание техники появится позже.')).not.toBeInTheDocument();
    // Details are open by default and load real catalog data (mock ex-1).
    await waitFor(() =>
      expect(screen.getByText(/Описание упражнения «Жим штанги лёжа»/)).toBeInTheDocument(),
    );
    expect(screen.getByText('Примите исходное положение.')).toBeInTheDocument();
  });
  it('shows the current-session set in history and opens the edit dialog on click', async () => {
    wrap(<WorkoutPage />);
    await userEvent.type(screen.getByLabelText('КГ'), '50');
    await userEvent.type(screen.getByLabelText('Повторы'), '10');
    await userEvent.click(screen.getByRole('button', { name: 'Добавить' }));
    // History is expanded by default; the freshly logged set appears under "Эта тренировка".
    expect(screen.getByText('Эта тренировка')).toBeInTheDocument();
    const row = screen.getByRole('button', { name: /50 кг × 10/ });
    expect(row).toBeInTheDocument();
    // Clicking the row opens the edit dialog (local sets are editable).
    await userEvent.click(row);
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Удалить' })).toBeInTheDocument();
  });
  it('hides the premium rest timer until a set is logged, then shows it', async () => {
    setMockSubscription({
      is_active: true,
      ends_at: '2099-01-01T00:00:00Z',
      entitlements: undefined,
    });
    wrap(<WorkoutPage />);
    // No sets yet -> the column reads as a dormant timer, not as rest.
    expect(screen.getByText('Таймер')).toBeInTheDocument();
    expect(screen.queryByText('Отдых')).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('КГ'), '50');
    await userEvent.type(screen.getByLabelText('Повторы'), '10');
    await userEvent.click(screen.getByRole('button', { name: 'Добавить' }));
    // After the first set the column switches to the rest label.
    expect(screen.getByText('Отдых')).toBeInTheDocument();
    expect(screen.queryByText('Таймер')).not.toBeInTheDocument();
    // The "i" button explaining the rest timer (UX-3) fires a toast on tap
    // (the toast renders imperatively outside this tree).
    const info = screen.getByRole('button', { name: 'Как работает таймер отдыха' });
    expect(info).toBeInTheDocument();
    await userEvent.click(info);
  });
  it('finishing online syncs and navigates to the summary with server state', async () => {
    wrapWithSummaryRoute();
    await userEvent.type(screen.getByLabelText('КГ'), '50');
    await userEvent.type(screen.getByLabelText('Повторы'), '10');
    await userEvent.click(screen.getByRole('button', { name: 'Добавить' }));
    await userEvent.click(screen.getByRole('button', { name: 'Завершить тренировку' }));
    await userEvent.click(screen.getByRole('button', { name: 'Завершить' }));
    // MSW returns seq_number 1 (first sync) -> summary screen rendered from server state.
    await waitFor(() => expect(screen.getByText('Итоги тренировки #1')).toBeInTheDocument());
    expect(useWorkoutStore.getState().sessions.self).toBeUndefined();
    expect(useWorkoutStore.getState().activeKey).toBeNull();
  });
  it('finishing offline still navigates to a local summary (data not lost)', async () => {
    networkStatus.isOnline = false;
    networkStatus.isOffline = true;
    wrapWithSummaryRoute();
    await userEvent.type(screen.getByLabelText('КГ'), '50');
    await userEvent.type(screen.getByLabelText('Повторы'), '10');
    await userEvent.click(screen.getByRole('button', { name: 'Добавить' }));
    await userEvent.click(screen.getByRole('button', { name: 'Завершить тренировку' }));
    await userEvent.click(screen.getByRole('button', { name: 'Завершить' }));
    // Local summary uses seq_number 0 (server assigns the real one on replay).
    await waitFor(() => expect(screen.getByText('Итоги тренировки #0')).toBeInTheDocument());
    // Local summary still carries the exercise computed from logged sets.
    // (Scoped to the heading: the off-screen share card renders the same name.)
    expect(screen.getByRole('heading', { name: 'Жим лёжа' })).toBeInTheDocument();
    // Session removed so no stale active session lingers behind navigation.
    expect(useWorkoutStore.getState().sessions.self).toBeUndefined();
    expect(useWorkoutStore.getState().activeKey).toBeNull();
  });
  it('anchors the title column to the toolbar centre line, not its static position', () => {
    const { container } = wrap(<WorkoutPage />);
    // jsdom has no layout, so the guarantee is checked structurally. The
    // column is absolutely positioned, which takes it out of the flex flow
    // and drops it out of the toolbar's `align-items: center` — it needs an
    // explicit vertical anchor or it falls back to its static position while
    // the back chevron beside it stays centred.
    const column = container.querySelector('.toolbar > span.absolute');
    expect(column).not.toBeNull();
    expect(column!.className).toContain('top-1/2');
    expect(column!.className).toContain('-translate-y-1/2');
    // The horizontal centring and the truncation boundary must survive.
    expect(column!.className).toContain('inset-x-[56px]');
    expect(column!.querySelector('.page-title')?.className).toContain('max-w-full');
  });
  it('shows the contraindications block for a client session', async () => {
    useWorkoutStore.getState().reset();
    useWorkoutStore.getState().startSession({
      participant: { kind: 'client', clientId: 'client-stub-1', clientName: 'Вася' },
      programId: 'p1',
      dayId: 'd1',
      slots: [
        { slotId: 'sl1', variantId: 'v1', name: 'Жим лёжа', sets: 3, reps: 10, alternatives: [] },
      ],
    });
    wrap(<WorkoutPage />);
    await waitFor(() =>
      expect(screen.getByText('Грыжа L4-L5, ограничение по осевой нагрузке')).toBeInTheDocument(),
    );
  });
  /** Стартует сессию из двух упражнений и открывает страницу. */
  function startTwoExerciseSession() {
    useWorkoutStore.getState().reset();
    useWorkoutStore.getState().startSession({
      participant: { kind: 'self' },
      programId: 'p1',
      dayId: 'd1',
      slots: [
        { slotId: 'sl1', variantId: 'v1', name: 'Жим лёжа', sets: 2, reps: 10, alternatives: [] },
        { slotId: 'sl2', variantId: 'v2', name: 'Присед', sets: 2, reps: 10, alternatives: [] },
      ],
    });
  }
  async function logSet(weight: string, reps: string) {
    await userEvent.type(screen.getByLabelText('КГ'), weight);
    await userEvent.type(screen.getByLabelText('Повторы'), reps);
    await userEvent.click(screen.getByRole('button', { name: 'Добавить' }));
  }
  // Таймер один на всю тренировку: при переходе к другому упражнению он
  // продолжает отсчёт с последнего подхода, а не обнуляется в «—».
  it('keeps the rest timer running when the exercise is switched', async () => {
    startTwoExerciseSession();
    wrap(<WorkoutPage />);
    await logSet('50', '10');
    expect(screen.getByText('Отдых')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Следующее/ }));
    // Упражнение сменилось, подходов у нового нет — но таймер тот же.
    expect(screen.getByText('Присед')).toBeInTheDocument();
    expect(screen.getByText('Отдых')).toBeInTheDocument();
    expect(screen.queryByText('Таймер')).not.toBeInTheDocument();
  });
  it('marks the exercise completed once the planned sets are logged', async () => {
    startTwoExerciseSession();
    wrap(<WorkoutPage />);
    await logSet('50', '10');
    expect(screen.getByRole('checkbox', { name: 'Выполнено' })).not.toBeChecked();
    await logSet('50', '10');
    expect(await screen.findByRole('checkbox', { name: 'Выполнено' })).toBeChecked();
  });
  it('takes the completion back when the button is pressed again', async () => {
    startTwoExerciseSession();
    wrap(<WorkoutPage />);
    await logSet('50', '10');
    await logSet('50', '10');
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Выполнено' }));
    expect(await screen.findByRole('checkbox', { name: 'Выполнено' })).not.toBeChecked();
  });
});
