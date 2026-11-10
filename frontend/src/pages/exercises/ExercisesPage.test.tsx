import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { ExercisesPage } from './ExercisesPage';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[{ pathname: '/', key: crypto.randomUUID() }]}>
        <ExercisesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ExercisesPage', () => {
  it('lists exercises and filters by search', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Жим штанги лёжа')).toBeInTheDocument());
    await userEvent.type(screen.getByPlaceholderText('Поиск упражнения'), 'планка');
    await waitFor(() => expect(screen.getByText('Планка')).toBeInTheDocument());
    expect(screen.queryByText('Жим штанги лёжа')).not.toBeInTheDocument();
  });

  it('toggles the favorites filter button beside the results count', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Жим штанги лёжа')).toBeInTheDocument());

    const chip = screen.getByRole('button', { name: /Избранное/ });
    expect(chip).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');

    // Без избранных упражнений список становится пустым.
    await waitFor(() => expect(screen.getByText('Ничего не найдено')).toBeInTheDocument());

    await userEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'false');
  });

  it('keeps the "Все" chip active regardless of the favorites filter', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Жим штанги лёжа')).toBeInTheDocument());

    const allChip = screen.getByRole('button', { name: 'Все' });
    const favChip = screen.getByRole('button', { name: /Избранное/ });

    // По умолчанию (без выбранной категории) «Все» активен.
    expect(allChip).toHaveAttribute('data-active', 'true');

    // Избранное теперь независимо от категорий: «Все» остаётся активным.
    await userEvent.click(favChip);
    expect(favChip).toHaveAttribute('data-active', 'true');
    expect(allChip).toHaveAttribute('data-active', 'true');
  });
});
