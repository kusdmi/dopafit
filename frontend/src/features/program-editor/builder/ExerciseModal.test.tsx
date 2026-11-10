import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { recentExercises } from '@/shared/lib/recent/recent-exercises';

import { ExerciseModal } from './ExerciseModal';

function wrap(node: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

describe('ExerciseModal recent', () => {
  beforeEach(() => window.localStorage.clear());

  it('shows recent exercises first when the query is empty', async () => {
    recentExercises.push('ex-12'); // Планка — not the catalog head (ex-1 = Жим штанги лёжа)
    wrap(<ExerciseModal mode="main" onSubmit={vi.fn()} onClose={vi.fn()} />);
    // The input autofocuses on open, so the dropdown appears immediately even
    // with an empty query.
    const list = await screen.findByRole('list');
    // The first option button in the dropdown must be the recent item (Планка).
    // Recent details and the catalog load independently; wait for the recent response.
    await waitFor(() => {
      expect(within(list).getAllByRole('button')[0]).toHaveAccessibleName('Планка');
    });
    // The dropdown is an absolutely-positioned overlay (it must not push the
    // sets/reps inputs down).
    expect(list.className).toContain('absolute');
  });

  it('records a picked exercise into recent', async () => {
    wrap(<ExerciseModal mode="main" onSubmit={vi.fn()} onClose={vi.fn()} />);
    const input = screen.getByPlaceholderText('Название упражнения');
    await userEvent.type(input, 'Планка');
    const option = await screen.findByText('Планка');
    await userEvent.click(option);
    expect(recentExercises.get()).toContain('ex-12');
  });
});
