import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { useSessionStore } from '@/entities/session/model/store';
import { useWorkoutStore } from '@/entities/workout/model/store';
import type { Participant } from '@/entities/workout/model/types';
import { paths, programSession } from '@/shared/config/paths';

import { ActiveWorkoutWidget } from './ActiveWorkoutWidget';

function start(participant: Participant) {
  useWorkoutStore.getState().startSession({
    participant,
    programId: 'p1',
    dayId: 'd1',
    slots: [{ slotId: 'sl1', variantId: 'v1', name: 'Жим', sets: 3, reps: 10, alternatives: [] }],
  });
}

function setRole(role: 'client' | 'trainer') {
  useSessionStore.setState({ user: { role } as never, isAuthenticated: true });
}

function renderAt(path: string = paths.home) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ActiveWorkoutWidget />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useWorkoutStore.getState().reset();
  setRole('client');
});
afterEach(() => {
  useWorkoutStore.getState().reset();
  useSessionStore.setState({ user: null, isAuthenticated: false });
  vi.restoreAllMocks();
});

it('renders nothing when there are no sessions', () => {
  const { container } = renderAt();
  expect(container).toBeEmptyDOMElement();
});

it('client role shows a single timer plate with a running clock', () => {
  start({ kind: 'self' });
  renderAt();
  expect(screen.getByRole('button', { name: /тренировка идёт/i })).toBeInTheDocument();
  expect(screen.getByText(/^\d+:\d{2}$/)).toBeInTheDocument();
});

it('shows hour-long elapsed time as H:MM:SS', () => {
  start({ kind: 'self' });
  // Backdate the session ~2h02m05s so the timer crosses the hour boundary.
  const { sessions, activeKey } = useWorkoutStore.getState();
  const key = activeKey!;
  useWorkoutStore.setState({
    sessions: {
      ...sessions,
      [key]: { ...sessions[key], startedAt: new Date(Date.now() - 7325_000).toISOString() },
    },
  });
  renderAt();
  // H:MM:SS has three colon-separated groups; the bare M:SS form would fail this.
  expect(screen.getByText(/^\d+:\d{2}:\d{2}$/)).toBeInTheDocument();
});

it('trainer with one session shows that participant, no counter', () => {
  setRole('trainer');
  start({ kind: 'client', clientId: 'a', clientName: 'Аня' });
  renderAt();
  expect(screen.getByText('Аня')).toBeInTheDocument();
  expect(screen.queryByText(/идут/)).not.toBeInTheDocument();
});

it('trainer with several sessions shows the active one and a +N counter', () => {
  setRole('trainer');
  start({ kind: 'client', clientId: 'a', clientName: 'Аня' });
  start({ kind: 'client', clientId: 'b', clientName: 'Боря' });
  renderAt();
  expect(screen.getByText('Боря')).toBeInTheDocument();
  expect(screen.getByText('+1 идут')).toBeInTheDocument();
  expect(screen.getAllByRole('button')).toHaveLength(1);
});

// Макет 392:5261 знает ровно ОДИН вариант плашки — фиолетовый. Раньше своя
// тренировка рисовалась нейтральной карточкой, а фиолетовая доставалась только
// тренеру; роль к этому отношения не имеет. Проверяем обе роли, чтобы вариант
// «нейтральная плашка» не вернулся.
it.each([
  ['trainer', { kind: 'client', clientId: 'a', clientName: 'Аня' } as const],
  ['client', { kind: 'self' } as const],
])('paints the plate violet for %s', (role, participant) => {
  setRole(role as 'client' | 'trainer');
  start(participant);
  renderAt();
  const plate = screen.getByRole('button');
  expect(plate.style.background).toBe('var(--gradient-bg-accent-solid)');
  expect(plate.style.borderColor).toBe('var(--accent-plate-line)');
  expect(plate).not.toHaveClass('bg-card');
});

// Своя тренировка подписывалась «Я» — на плашке в собственном приложении это
// шум, и в макете такой подписи нет. У чужой имя остаётся: там оно различает,
// чья именно тренировка идёт.
it('labels a client workout but leaves your own unlabelled', () => {
  setRole('trainer');
  start({ kind: 'client', clientId: 'a', clientName: 'Аня' });
  renderAt();
  expect(screen.getByText('Аня')).toBeInTheDocument();
});

it('omits the participant label on your own workout', () => {
  setRole('client');
  start({ kind: 'self' });
  renderAt();
  expect(screen.queryByText('Я')).not.toBeInTheDocument();
  // Имя при этом не потеряно для скринридера — оно осталось в aria-label.
  expect(screen.getByRole('button', { name: 'Тренировка идёт: Я' })).toBeInTheDocument();
});

it('tapping the plate navigates to the active session workout page', () => {
  setRole('client');
  start({ kind: 'self' });
  function LocationProbe() {
    return <output data-testid="location">{useLocation().pathname}</output>;
  }
  render(
    <MemoryRouter initialEntries={[paths.home]}>
      <ActiveWorkoutWidget />
      <LocationProbe />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('button'));
  expect(screen.getByTestId('location')).toHaveTextContent(programSession('p1'));
});

// Макет 392:2229 подтыкает плашку ПОД таб-бар, а не ставит её на него, поэтому
// отсчёт идёт от верха бара минус нахлёст, а не от --tab-bar-space. Вместе с
// этим плашка обязана лежать НИЖЕ бара по слою и повторять его боковые поля —
// иначе нахлёст не спрячется и плашка разъедется с баром по ширине.
it('tucks under the tab bar instead of standing on it', () => {
  setRole('client');
  start({ kind: 'self' });
  renderAt();
  const wrapper = screen.getByRole('button', { name: /тренировка идёт/i }).parentElement;
  expect(wrapper).toHaveStyle({
    bottom: 'calc(var(--tab-bar-space) - 45px)',
    paddingInline: 'var(--bottom-nav-gutter)',
  });
  // z-40 против z-41 у .bottom-nav: бар перекрывает плашку, а не наоборот.
  expect(wrapper).toHaveClass('z-40');
});

// Нижние 45px плашки спрятаны за баром, и место под них уже сидит в
// --tab-bar-space. Публиковаться должна только видимая часть, иначе нахлёст
// резервируется дважды.
it('reserves only the part of the plate visible above the bar', () => {
  setRole('client');
  start({ kind: 'self' });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    height: 100,
  } as DOMRect);
  renderAt();
  expect(document.documentElement.style.getPropertyValue('--active-plate-space')).toBe('55px');
});

it('reserves scroll space via a CSS custom property while visible', () => {
  setRole('client');
  start({ kind: 'self' });
  const { unmount } = renderAt(paths.home);
  expect(document.documentElement.getAttribute('data-active-plate')).toBe('true');
  unmount();
  expect(document.documentElement.getAttribute('data-active-plate')).toBeNull();
});

it('is hidden on the workout session page', () => {
  setRole('client');
  start({ kind: 'self' });
  const { container } = renderAt(programSession('p1'));
  expect(container).toBeEmptyDOMElement();
});

it('is visible on other authorized pages', () => {
  setRole('client');
  start({ kind: 'self' });
  const { container } = renderAt(paths.programs);
  expect(container).not.toBeEmptyDOMElement();
});

it('reflects the store: shows the active session after another finishes', () => {
  setRole('trainer');
  start({ kind: 'client', clientId: 'a', clientName: 'Аня' });
  start({ kind: 'client', clientId: 'b', clientName: 'Боря' });
  const { rerender } = renderAt(paths.home);
  expect(screen.getByText('Боря')).toBeInTheDocument();
  expect(screen.getByText('+1 идут')).toBeInTheDocument();

  useWorkoutStore.getState().finishSession('client:b');
  rerender(
    <MemoryRouter initialEntries={[paths.home]}>
      <ActiveWorkoutWidget />
    </MemoryRouter>,
  );
  expect(screen.getByText('Аня')).toBeInTheDocument();
  expect(screen.queryByText(/идут/)).not.toBeInTheDocument();
});
