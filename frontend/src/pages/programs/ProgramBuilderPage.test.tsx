import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useNavigation } from '@/shared/lib/navigation';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetNetworkStatusForTests } from '@/shared/lib/network/useNetworkStatus';
import { paths, programEdit } from '@/shared/config/paths';
import { ProgramBuilderPage } from './ProgramBuilderPage';
import { programKey } from '@/entities/program/api/use-program';
type RouterHistory = ReturnType<typeof useNavigation>;
/** Grabs the router history so a test can spy on its push. */
function CaptureHistory({ onReady }: { onReady: (h: RouterHistory) => void }) {
  const history = useNavigation();
  onReady(history);
  return null;
}
afterEach(() => {
  vi.restoreAllMocks();
  resetNetworkStatusForTests();
  onlineManager.setOnline(true);
});
function renderNew() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[paths.programNew]}>
        <ProgramBuilderPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
function renderEditAt(
  id: string,
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[programEdit(id)]}>
        <Routes>
          <Route path={programEdit(':id')} element={<ProgramBuilderPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
describe('ProgramBuilderPage', () => {
  it('loads a fresh program before initializing an editor from a cached detail', async () => {
    const { api } = await import('@/shared/api/client');
    const { data } = await api.GET('/api/v1/programs/{program_id}', {
      params: { path: { program_id: 'std-strength' } },
    });
    expect(data).toBeDefined();
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
    });
    qc.setQueryData(programKey('std-strength'), { ...data, name: 'Устаревшая программа' });
    renderEditAt('std-strength', qc);
    await waitFor(() =>
      expect(screen.getByPlaceholderText('Название программы')).toHaveValue('Силовая (копия)'),
    );
  });
  it('requires an exercise before saving a program', async () => {
    renderNew();
    const save = screen.getByRole('button', { name: 'Сохранить программу' });
    expect(save).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText('Название программы'), 'Сила');
    expect(save).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Добавить день' }));
    await userEvent.type(screen.getByPlaceholderText('Название дня'), 'День 1');
    await userEvent.click(screen.getByText('Добавить'));
    expect(save).toBeDisabled();
    expect(screen.getByText('Добавьте хотя бы одно упражнение')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Добавить упражнение' }));
    await userEvent.type(screen.getByPlaceholderText('Название упражнения'), 'Жим');
    await userEvent.type(screen.getByPlaceholderText('Подходы'), '4');
    await userEvent.type(screen.getByPlaceholderText('Повторения'), '8');
    await userEvent.click(screen.getByText('Добавить'));
    expect(save).toBeEnabled();
  });
  it('builds a program with a day and an exercise', async () => {
    renderNew();
    await userEvent.type(screen.getByPlaceholderText('Название программы'), 'Сила');
    await userEvent.click(screen.getByRole('button', { name: 'Добавить день' }));
    await userEvent.type(screen.getByPlaceholderText('Название дня'), 'День 1');
    await userEvent.click(screen.getByText('Добавить'));
    await waitFor(() => expect(screen.getByText('День 1')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Добавить упражнение' }));
    await userEvent.type(screen.getByPlaceholderText('Название упражнения'), 'Жим');
    await userEvent.type(screen.getByPlaceholderText('Подходы'), '4');
    await userEvent.type(screen.getByPlaceholderText('Повторения'), '8');
    await userEvent.click(screen.getByText('Добавить'));
    await waitFor(() => expect(screen.getByText('Жим')).toBeInTheDocument());
    expect(screen.getByText('4 подхода × 8 повторений')).toBeInTheDocument();
  });
  it('navigates away with a toast instead of hanging when saving offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    resetNetworkStatusForTests();
    onlineManager.setOnline(false);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[paths.programNew]}>
          <Routes>
            <Route path={paths.programNew} element={<ProgramBuilderPage />} />
            <Route path={paths.programs} element={<div>Каталог программ</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await userEvent.type(screen.getByPlaceholderText('Название программы'), 'Офлайн');
    await userEvent.click(screen.getByRole('button', { name: 'Добавить день' }));
    await userEvent.type(screen.getByPlaceholderText('Название дня'), 'День 1');
    await userEvent.click(screen.getByText('Добавить'));
    await waitFor(() => expect(screen.getByText('День 1')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Добавить упражнение' }));
    await userEvent.type(screen.getByPlaceholderText('Название упражнения'), 'Жим');
    await userEvent.type(screen.getByPlaceholderText('Подходы'), '4');
    await userEvent.type(screen.getByPlaceholderText('Повторения'), '8');
    await userEvent.click(screen.getByText('Добавить'));
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить программу' }));
    // Offline save must not strand the user on a spinning builder — it navigates
    // to the catalog (the optimistic list already shows the queued program).
    await waitFor(() => expect(screen.getByText('Каталог программ')).toBeInTheDocument());
  });
  it('offline save does not re-navigate when the paused mutation replays on reconnect', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    resetNetworkStatusForTests();
    onlineManager.setOnline(false);
    let history: RouterHistory | null = null;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[paths.programNew]}>
          <CaptureHistory onReady={(h) => (history = h)} />
          <Routes>
            <Route path={paths.programNew} element={<ProgramBuilderPage />} />
            <Route path={paths.programs} element={<div>Каталог программ</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const initialKey = (history as unknown as RouterHistory).location.key;
    await userEvent.type(screen.getByPlaceholderText('Название программы'), 'Офлайн');
    await userEvent.click(screen.getByRole('button', { name: 'Добавить день' }));
    await userEvent.type(screen.getByPlaceholderText('Название дня'), 'День 1');
    await userEvent.click(screen.getByText('Добавить'));
    await waitFor(() => expect(screen.getByText('День 1')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Добавить упражнение' }));
    await userEvent.type(screen.getByPlaceholderText('Название упражнения'), 'Жим');
    await userEvent.type(screen.getByPlaceholderText('Подходы'), '4');
    await userEvent.type(screen.getByPlaceholderText('Повторения'), '8');
    await userEvent.click(screen.getByText('Добавить'));
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить программу' }));
    // Imperative offline navigation happened exactly once.
    await waitFor(() => expect(screen.getByText('Каталог программ')).toBeInTheDocument());
    const savedKey = (history as unknown as RouterHistory).location.key;
    expect(savedKey).not.toBe(initialKey);
    // Reconnect replays the paused mutation. The builder's observer is unmounted
    // by navigation, but even if it lingered there is no onSuccess navigation
    // callback attached offline, so no second push to the catalog fires.
    onlineManager.setOnline(true);
    await qc.resumePausedMutations();
    await waitFor(() => expect(qc.isMutating()).toBe(0));
    expect((history as unknown as RouterHistory).location.key).toBe(savedKey);
  });
  it('pre-fills the name with " (копия)" and shows copy UI for a standard program', async () => {
    renderEditAt('std-strength');
    await waitFor(() => expect(screen.getByDisplayValue('Силовая (копия)')).toBeInTheDocument());
    expect(
      screen.getByText('Изменения сохранятся как ваша собственная копия.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Сохранить копию')).toBeInTheDocument();
  });
  it('forks a standard program into a new copy on save (POST, not PUT)', async () => {
    renderEditAt('std-strength');
    await waitFor(() => expect(screen.getByDisplayValue('Силовая (копия)')).toBeInTheDocument());
    await userEvent.click(await screen.findByRole('button', { name: 'Сохранить копию' }));
    const { api } = await import('@/shared/api/client');
    await waitFor(async () => {
      const { data } = await api.GET('/api/v1/programs');
      const names = (data ?? []).map((p) => p.name);
      expect(names).toContain('Силовая (копия)');
    });
    const { data } = await api.GET('/api/v1/programs');
    expect((data ?? []).some((p) => p.name === 'Силовая' && p.is_standard)).toBe(true);
    const copy = (data ?? []).find((p) => p.name === 'Силовая (копия)');
    expect(copy).toBeTruthy();
    expect(copy?.id).not.toBe('std-strength');
  });
});

it('shows server validation details without losing the editable draft', async () => {
  const { http, HttpResponse } = await import('msw');
  const { server } = await import('@/app/mocks/server');
  const { env } = await import('@/shared/config/env');
  server.use(
    http.post(`${env.apiUrl}/api/v1/programs`, () =>
      HttpResponse.json(
        {
          code: 'validation_error',
          message: 'Request validation failed',
          details: [{ path: ['name'], code: 'too_big', maximum: 255, origin: 'string' }],
        },
        { status: 422 },
      ),
    ),
  );
  renderNew();
  await userEvent.type(screen.getByLabelText('Название программы'), 'Сила');
  const { useBuilderStore } = await import('@/features/program-editor/builder/model/store');
  act(() => {
    const store = useBuilderStore.getState();
    store.addDay('День 1');
    store.addExercise(useBuilderStore.getState().draft.days[0].id, {
      exercise_id: null,
      custom_name: 'Жим',
      name: 'Жим',
      sets: 3,
      reps: 10,
    });
  });
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить программу' }));
  expect(
    await screen.findByText('Название программы, название: Максимум 255 символов'),
  ).toBeVisible();
  expect(screen.getByLabelText('Название программы')).toHaveValue('Сила');
  expect(screen.getByLabelText('Название программы')).toHaveAttribute('aria-invalid', 'true');
  await userEvent.type(screen.getByLabelText('Название программы'), ' 2');
  expect(
    screen.queryByText('Название программы, название: Максимум 255 символов'),
  ).not.toBeInTheDocument();
});
