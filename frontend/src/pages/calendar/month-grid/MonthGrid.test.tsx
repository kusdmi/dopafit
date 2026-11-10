import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { MonthGrid } from './MonthGrid';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

it('renders all day numbers of the month', () => {
  render(<MonthGrid year={2026} month={6} eventsByDay={new Map()} today="2026-06-01" onDayClick={() => {}} />);
  // June has 30 days.
  expect(screen.getByText('1')).toBeInTheDocument();
  expect(screen.getByText('30')).toBeInTheDocument();
  expect(screen.queryByText('31')).not.toBeInTheDocument();
});

it('renders indicators from eventsByDay', () => {
  const eventsByDay = new Map([
    [10, { hasPersonal: true, hasWithClients: false }],
    [12, { hasPersonal: false, hasWithClients: true }],
  ]);
  const { container } = render(
    <MonthGrid year={2026} month={6} eventsByDay={eventsByDay} today="2026-06-01" onDayClick={() => {}} />,
  );
  expect(container.querySelector('[data-indicator="personal"]')).toBeInTheDocument();
  expect(container.querySelector('[data-indicator="with_clients"]')).toBeInTheDocument();
});

it('marks today', () => {
  const { container } = render(
    <MonthGrid year={2026} month={6} eventsByDay={new Map()} today="2026-06-01" onDayClick={() => {}} />,
  );
  const today = container.querySelector('[data-today]');
  expect(today).toBeInTheDocument();
  expect(today).toHaveTextContent('15');
});

it('keeps the personal indicator accent-coloured on the today cell, readable via its ring', () => {
  const eventsByDay = new Map([[15, { hasPersonal: true, hasWithClients: false }]]);
  const { container } = render(
    <MonthGrid year={2026} month={6} eventsByDay={eventsByDay} today="2026-06-01" onDayClick={() => {}} />,
  );
  const todayCell = container.querySelector('[data-today]');
  const dot = todayCell?.querySelector('[data-indicator="personal"]');
  expect(dot).not.toBeNull();
  // The accent dot is 1:1 against the accent-filled today cell, so it takes a
  // light ring (Figma 392:5206) instead of being repainted: the orange is the
  // signal that marks a personal workout on every other day.
  expect(dot).toHaveClass('bg-brand-400');
  expect(dot).toHaveClass('ring-brand-50');
});

it('keeps the client indicator violet on the today cell, readable via its ring', () => {
  const eventsByDay = new Map([[15, { hasPersonal: false, hasWithClients: true }]]);
  const { container } = render(
    <MonthGrid year={2026} month={6} eventsByDay={eventsByDay} today="2026-06-01" onDayClick={() => {}} />,
  );
  const todayCell = container.querySelector('[data-today]');
  const dot = todayCell?.querySelector('[data-indicator="with_clients"]');
  expect(dot).not.toBeNull();
  // Same treatment as the personal dot: hue kept, legibility from the ring.
  expect(dot).toHaveClass('bg-trainer-text');
  expect(dot).toHaveClass('ring-brand-50');
});

it('keeps the two today-cell indicators distinguishable from each other', () => {
  const eventsByDay = new Map([[15, { hasPersonal: true, hasWithClients: true }]]);
  const { container } = render(
    <MonthGrid year={2026} month={6} eventsByDay={eventsByDay} today="2026-06-01" onDayClick={() => {}} />,
  );
  const todayCell = container.querySelector('[data-today]');
  // Both keep their own hue, so the pair reads by the same colour coding used
  // on every other day; the ring is identical on both and only lifts them off
  // the fill.
  expect(todayCell?.querySelector('[data-indicator="personal"]')).toHaveClass('bg-brand-400');
  expect(todayCell?.querySelector('[data-indicator="with_clients"]')).toHaveClass(
    'bg-trainer-text',
  );
});

it('keeps the indicator hues on a non-today cell', () => {
  const eventsByDay = new Map([[10, { hasPersonal: true, hasWithClients: true }]]);
  const { container } = render(
    <MonthGrid year={2026} month={6} eventsByDay={eventsByDay} today="2026-06-01" onDayClick={() => {}} />,
  );
  // Ordinary cells keep the two hues rather than the today cell's neutral flip.
  // Personal is the app's fixed accent orange, not the themed brand-text alias:
  // the dot has to read as the same accent used everywhere else (see MonthGrid).
  const personal = container.querySelector('[data-indicator="personal"]');
  expect(personal).toHaveClass('bg-brand-400');
  expect(personal).not.toHaveClass('bg-neutral-50');
  const client = container.querySelector('[data-indicator="with_clients"]');
  expect(client).toHaveClass('bg-trainer-text');
  expect(client).not.toHaveClass('bg-neutral-900');
});

it('keeps the personal marker on the fixed accent and the client one thematic', () => {
  const eventsByDay = new Map([[10, { hasPersonal: true, hasWithClients: true }]]);
  const { container } = render(
    <MonthGrid year={2026} month={6} eventsByDay={eventsByDay} today="2026-06-01" onDayClick={() => {}} />,
  );
  // The personal dot must read as the app's accent, so it stays on the fixed
  // brand-400 rather than the brand-text alias, which flips to step 600 in the
  // light theme and stops looking like the accent. That trades away the 3:1
  // floor for non-text graphics in the light theme (1.97:1 on --card-light) —
  // a deliberate product decision, documented in design-system.md under
  // "Известные ограничения контраста" and mirrored by WeekStrip on the home
  // screen.
  expect(container.querySelector('[data-indicator="personal"]')).not.toHaveClass('bg-brand-text');
  // The client dot was not part of that decision and keeps the thematic alias,
  // which clears 3:1 in both themes (3.62:1 dark / 4.04:1 light).
  expect(container.querySelector('[data-indicator="with_clients"]')).not.toHaveClass(
    'bg-trainer-500',
  );
});

it('calls onDayClick with the iso date', () => {
  const onDayClick = vi.fn();
  render(<MonthGrid year={2026} month={6} eventsByDay={new Map()} today="2026-06-01" onDayClick={onDayClick} />);
  fireEvent.click(screen.getByText('7'));
  expect(onDayClick).toHaveBeenCalledWith('2026-06-07');
});

// Прошедший пустой день записи не принимает: ячейка отключена, а не молча
// игнорирует тап — иначе она выглядит нажимаемой и ничего не делает.
it('disables an empty day that has already passed', () => {
  const onDayClick = vi.fn();
  render(
    <MonthGrid year={2026} month={6} eventsByDay={new Map()} today="2026-06-15" onDayClick={onDayClick} />,
  );
  const past = screen.getByText('7').closest('button');
  expect(past).toBeDisabled();
  fireEvent.click(past!);
  expect(onDayClick).not.toHaveBeenCalled();
});

// Сегодняшний день ещё не прошёл — вечерняя тренировка впереди.
it('keeps today bookable', () => {
  const onDayClick = vi.fn();
  render(
    <MonthGrid year={2026} month={6} eventsByDay={new Map()} today="2026-06-15" onDayClick={onDayClick} />,
  );
  fireEvent.click(screen.getByText('15'));
  expect(onDayClick).toHaveBeenCalledWith('2026-06-15');
});

// Прошедший день С тренировкой остаётся кликабельным: его карточку открывают,
// чтобы посмотреть или отменить невыполненный план.
it('keeps a past day with events clickable', () => {
  const onDayClick = vi.fn();
  const eventsByDay = new Map([[7, { hasPersonal: true, hasWithClients: false }]]);
  render(
    <MonthGrid year={2026} month={6} eventsByDay={eventsByDay} today="2026-06-15" onDayClick={onDayClick} />,
  );
  const past = screen.getByText('7').closest('button');
  expect(past).not.toBeDisabled();
  fireEvent.click(past!);
  expect(onDayClick).toHaveBeenCalledWith('2026-06-07');
});
