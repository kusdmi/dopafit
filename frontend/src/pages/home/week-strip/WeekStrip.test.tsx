import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { WeekStrip } from './WeekStrip';

beforeEach(() => {
  vi.useFakeTimers();
  // Monday 2026-06-15.
  vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

it('renders 7 days of the current week', () => {
  const { container } = render(<WeekStrip days={[]} onOpen={() => {}} />);
  // One cell per day, each keyed by its ISO date.
  expect(container.querySelectorAll('[data-iso]')).toHaveLength(7);
  // Monday-first: week of 2026-06-15 starts on the 15th. Figma 392:2063 shows
  // the day number zero-padded ("02"), so two-digit days render verbatim.
  expect(screen.getByText('15')).toBeInTheDocument();
  expect(screen.getByText('21')).toBeInTheDocument();
});

it('shows a personal marker only inside the day cell that has a personal workout', () => {
  // System time pinned to Monday 2026-06-15 in beforeEach, so the iso is stable.
  const { container } = render(
    <WeekStrip days={[{ date: '2026-06-17', personal: true, client: false }]} onOpen={() => {}} />,
  );
  expect(
    container.querySelector('[data-iso="2026-06-17"] [data-marker="personal"]'),
  ).not.toBeNull();
  // No client marker for this day.
  expect(container.querySelector('[data-iso="2026-06-17"] [data-marker="client"]')).toBeNull();
  // A cell without an event has no markers.
  expect(container.querySelector('[data-iso="2026-06-16"] [data-marker]')).toBeNull();
  // Exactly one personal marker across the whole strip.
  expect(container.querySelectorAll('[data-marker="personal"]')).toHaveLength(1);
});

it('shows a client marker for a day with a client workout', () => {
  const { container } = render(
    <WeekStrip days={[{ date: '2026-06-18', personal: false, client: true }]} onOpen={() => {}} />,
  );
  expect(container.querySelector('[data-iso="2026-06-18"] [data-marker="client"]')).not.toBeNull();
  expect(container.querySelector('[data-iso="2026-06-18"] [data-marker="personal"]')).toBeNull();
});

it('shows both markers when a day has personal and client workouts', () => {
  const { container } = render(
    <WeekStrip days={[{ date: '2026-06-19', personal: true, client: true }]} onOpen={() => {}} />,
  );
  expect(
    container.querySelector('[data-iso="2026-06-19"] [data-marker="personal"]'),
  ).not.toBeNull();
  expect(container.querySelector('[data-iso="2026-06-19"] [data-marker="client"]')).not.toBeNull();
});

it('keeps the personal marker accent-coloured on the today cell, readable via its ring', () => {
  const { container } = render(
    <WeekStrip days={[{ date: '2026-06-15', personal: true, client: false }]} onOpen={() => {}} />,
  );
  const cell = container.querySelector('[data-iso="2026-06-15"]');
  // The today cell carries the accent fill, so an accent dot on it is 1:1
  // against its background. It is separated by a light ring (Figma 392:5206)
  // rather than by repainting the dot: the orange IS the signal that tells a
  // personal workout apart on every other day.
  expect(cell).toHaveClass('bg-brand-400');
  const dot = cell?.querySelector('[data-marker="personal"]');
  expect(dot).not.toBeNull();
  expect(dot).toHaveClass('bg-brand-400');
  expect(dot).toHaveClass('ring-brand-50');
});

it('renders the today cell type in the fixed accent foreground, not the themed content', () => {
  const { container } = render(<WeekStrip days={[]} onOpen={() => {}} />);
  const cell = container.querySelector('[data-iso="2026-06-15"]');
  expect(cell).toHaveClass('bg-brand-400');
  // brand-400 is a FIXED fill, so the type on it must be fixed too — themed
  // `content` would flip with the theme. chart-1-fg is the light foreground the
  // rest of the app already paints on the accent.
  const [weekday, dayNumber] = [...(cell?.querySelectorAll('span') ?? [])];
  expect(weekday).toHaveClass('text-chart-1-fg');
  expect(weekday).not.toHaveClass('text-content');
  expect(dayNumber).toHaveClass('text-chart-1-fg');
  expect(dayNumber).not.toHaveClass('text-content');
});

it('keeps the themed content colour on the other days', () => {
  const { container } = render(<WeekStrip days={[]} onOpen={() => {}} />);
  const cell = container.querySelector('[data-iso="2026-06-17"]');
  expect(cell).not.toHaveClass('bg-brand-400');
  // No fill under these, so they follow the theme as before.
  const [weekday, dayNumber] = [...(cell?.querySelectorAll('span') ?? [])];
  expect(weekday).toHaveClass('text-content');
  expect(dayNumber).toHaveClass('text-content');
});

it('keeps the client marker violet on the today cell, readable via its ring', () => {
  const { container } = render(
    <WeekStrip days={[{ date: '2026-06-15', personal: false, client: true }]} onOpen={() => {}} />,
  );
  const cell = container.querySelector('[data-iso="2026-06-15"]');
  expect(cell).toHaveClass('bg-brand-400');
  const dot = cell?.querySelector('[data-marker="client"]');
  expect(dot).not.toBeNull();
  // trainer-500 on the accent fill is 1.53:1, so it takes the same light ring
  // as the personal dot instead of being repainted.
  expect(dot).toHaveClass('bg-trainer-500');
  expect(dot).toHaveClass('ring-brand-50');
});

it('keeps the two today-cell markers distinguishable from each other', () => {
  const { container } = render(
    <WeekStrip days={[{ date: '2026-06-15', personal: true, client: true }]} onOpen={() => {}} />,
  );
  const cell = container.querySelector('[data-iso="2026-06-15"]');
  const personal = cell?.querySelector('[data-marker="personal"]');
  const client = cell?.querySelector('[data-marker="client"]');
  // Both keep their own hue, so the pair stays distinguishable by the same
  // colour coding used on every other day — the ring only lifts them off the
  // fill and is deliberately identical on both.
  expect(personal).toHaveClass('bg-brand-400');
  expect(client).toHaveClass('bg-trainer-500');
});

it('keeps the marker hues on a non-today cell', () => {
  const { container } = render(
    <WeekStrip days={[{ date: '2026-06-17', personal: true, client: true }]} onOpen={() => {}} />,
  );
  const personal = container.querySelector('[data-iso="2026-06-17"] [data-marker="personal"]');
  expect(personal).toHaveClass('bg-brand-400');
  expect(personal).not.toHaveClass('bg-neutral-50');
  const client = container.querySelector('[data-iso="2026-06-17"] [data-marker="client"]');
  expect(client).toHaveClass('bg-trainer-500');
  expect(client).not.toHaveClass('bg-neutral-900');
});

it('renders no markers for a day without workouts', () => {
  const { container } = render(<WeekStrip days={[]} onOpen={() => {}} />);
  expect(container.querySelectorAll('[data-marker]')).toHaveLength(0);
});

it('calls onOpen when the widget is clicked', () => {
  const onOpen = vi.fn();
  render(<WeekStrip days={[]} onOpen={onOpen} />);
  fireEvent.click(screen.getByRole('button', { name: 'Открыть календарь' }));
  expect(onOpen).toHaveBeenCalledTimes(1);
});
