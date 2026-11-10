import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { components } from '@/shared/api/schema';

import { ProgramList } from './ProgramList';

type ProgramListItem = components['schemas']['ProgramListItem'];

// The widget only reads programs.data, so mocking the hook keeps this test focused
// on the grouping/badge rendering without an HTTP round-trip.
const programsData: { data: ProgramListItem[] } = { data: [] };
vi.mock('@/entities/program/api/use-programs', () => ({
  usePrograms: () => programsData,
}));

function item(over: Partial<ProgramListItem>): ProgramListItem {
  return {
    id: 'p1',
    name: 'Программа',
    kind: 'strength',
    is_standard: false,
    updated_at: '2026-01-01T00:00:00Z',
    day_count: 2,
    exercise_count: 5,
    for_client_id: null,
    for_client_name: null,
    ...over,
  };
}

function renderList() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <ProgramList />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ProgramList', () => {
  beforeEach(() => {
    programsData.data = [];
  });

  it('renders a "Программы клиентов" section with a per-client badge for share-copies', async () => {
    programsData.data = [
      item({ id: 'own-1', name: 'Моя силовая' }),
      item({
        id: 'copy-1',
        name: 'Копия для Васи',
        for_client_id: 'c1',
        for_client_name: 'Вася',
      }),
    ];

    renderList();
    // The copies section lives under the "Мои программы" tab.
    await userEvent.click(screen.getByText('Мои программы'));

    expect(screen.getByText('Программы клиентов')).toBeInTheDocument();
    expect(screen.getByText('для клиента Вася')).toBeInTheDocument();
    // The own program still shows without a client badge.
    expect(screen.getByText('Моя силовая')).toBeInTheDocument();
  });

  it('shows no client section when the list has no copies (unchanged behaviour)', async () => {
    programsData.data = [item({ id: 'own-1', name: 'Моя силовая' })];

    renderList();
    await userEvent.click(screen.getByText('Мои программы'));

    expect(screen.queryByText('Программы клиентов')).not.toBeInTheDocument();
    expect(screen.getByText('Моя силовая')).toBeInTheDocument();
  });
});
