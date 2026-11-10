import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it } from 'vitest';

import { notificationsQueryKey } from '@/entities/notification/api/use-notifications';
import { useSessionStore } from '@/entities/session/model/store';

import { HomePage } from './HomePage';

function renderPage(seed?: (qc: QueryClient) => void) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  seed?.(qc);
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <HomePage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

it('shows streak and personal record from the dashboard', async () => {
  useSessionStore.setState({ user: { id: 'u1', role: 'client' } as never, isAuthenticated: true });
  renderPage();
  // Anchor the wait on data unique to the dashboard response. The streak value
  // ("8") is not a safe anchor: the WeekStrip renders real calendar day numbers,
  // so a day cell can already contain "8" on first render — before the async
  // dashboard query settles — making the wait resolve prematurely. The exercise
  // name appears twice (the record card's title and the strength chart's
  // subtitle, both per Figma), so anchor on the record weight instead.
  await waitFor(() => expect(screen.getByText('100 кг')).toBeInTheDocument());
  // The record card is titled with the exercise and hinted "Личный рекорд".
  const recordCard = screen.getByText('Личный рекорд').closest('.rounded-card') as HTMLElement;
  expect(within(recordCard).getByText(/Жим лёжа/)).toBeInTheDocument();
  // Scope the streak value to its own card: "8" also appears in the WeekStrip
  // as a calendar day number, so an unscoped getByText('8') is ambiguous.
  const streakCard = screen.getByText('Серия').closest('.rounded-card') as HTMLElement;
  expect(within(streakCard).getByText('8')).toBeInTheDocument();
});

it('shows neutral dashes (no transient "0") before the dashboard resolves (M1)', async () => {
  useSessionStore.setState({ user: { id: 'u1', role: 'client' } as never, isAuthenticated: true });
  renderPage();
  // Before the first dashboard response settles, the stat cards must NOT flash
  // "0"/"0%": the streak card shows a neutral dash instead. Assert synchronously
  // on first render (the placeholder has no delay).
  const streakCard = screen.getByText('Серия').closest('.rounded-card') as HTMLElement;
  expect(within(streakCard).queryByText('0')).not.toBeInTheDocument();
  expect(within(streakCard).getByText('—')).toBeInTheDocument();
  expect(screen.queryByText(/Добрый[^!]*, !/)).not.toBeInTheDocument();
  // After the query resolves, the real value appears.
  await waitFor(() => expect(within(streakCard).getByText('8')).toBeInTheDocument());
});

it('shows the unread notification badge anchored to the bell icon (UX-4)', () => {
  useSessionStore.setState({ user: { id: 'u1', role: 'client' } as never, isAuthenticated: true });
  renderPage((qc) => {
    qc.setQueryData(notificationsQueryKey, { unread: 3, items: [], total: 3 });
  });
  expect(screen.getByLabelText('Непрочитанные уведомления: 3')).toBeInTheDocument();
});

it('hides the badge when there are no unread notifications', () => {
  useSessionStore.setState({ user: { id: 'u1', role: 'client' } as never, isAuthenticated: true });
  renderPage((qc) => {
    qc.setQueryData(notificationsQueryKey, { unread: 0, items: [], total: 0 });
  });
  expect(screen.queryByLabelText(/Непрочитанные уведомления/)).not.toBeInTheDocument();
});

it('puts the full brand mark in the header, plate and wordmark together', () => {
  useSessionStore.setState({ user: { id: 'u1', role: 'client' } as never, isAuthenticated: true });
  const { container } = renderPage();
  // Logo exposes one accessible name for the pair; the wordmark alone used to
  // sit here aria-hidden, leaving the header without a brand name at all.
  const logo = screen.getByRole('img', { name: 'DopaFit' });
  // The plate (a <rect>) exists only in BrandIcon, so its presence is what
  // tells the full logo apart from the bare wordmark.
  expect(logo.querySelector('rect')).not.toBeNull();
  expect(container.querySelector('path[fill="currentColor"]')).not.toBeNull();
});

it('lets the toolbar spread its end slot away from the brand mark', () => {
  useSessionStore.setState({ user: { id: 'u1', role: 'client' } as never, isAuthenticated: true });
  const { container } = renderPage();
  // jsdom has no layout, so the guarantee is checked structurally: the bell
  // lives in an end slot that is a DIRECT child of .toolbar, the selector the
  // `margin-left: auto` spread rule is scoped to. Nesting it any deeper would
  // silently drop the rule and strand the bell against the logo again.
  const endSlot = container.querySelector('.toolbar > .toolbar-actions--end');
  expect(endSlot).not.toBeNull();
  expect(endSlot!.querySelector('[aria-label="Уведомления"]')).not.toBeNull();
});

// Карточка рекорда и график силового прогресса — два НЕЗАВИСИМЫХ выбора.
// Раньше обе плашки открывали один и тот же пикер и писали в один ключ, поэтому
// выбор упражнения для рекорда вверху молча переставлял график внизу. Бэкенд
// различал их с самого начала (record_exercise_id / strength_exercise_id).
it('opens separate pickers for the record card and the strength chart', async () => {
  useSessionStore.setState({ user: { id: 'u1', role: 'client' } as never, isAuthenticated: true });
  renderPage();
  await waitFor(() => expect(screen.getByText('100 кг')).toBeInTheDocument());

  const recordPick = screen.getByRole('button', { name: 'Сменить упражнение рекорда' });
  const chartPick = screen.getByRole('button', { name: 'Сменить упражнение' });
  expect(recordPick).not.toBe(chartPick);

  // Карточка рекорда открывает свой пикер, озаглавленный отдельно.
  fireEvent.click(recordPick);
  expect(await screen.findByText('Упражнение рекорда')).toBeInTheDocument();
  // И это НЕ пикер графика: его заголовок в этот момент не показан.
  expect(screen.queryByText(/^Упражнение$/)).not.toBeInTheDocument();
});
