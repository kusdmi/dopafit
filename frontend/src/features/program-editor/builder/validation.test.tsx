import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import { ExerciseModal } from './ExerciseModal';
import { DayModal } from './DayModal';

it('explains invalid exercise parameters and submits corrected values', async () => {
  const submit = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ExerciseModal mode="main" onSubmit={submit} onClose={vi.fn()} />
    </QueryClientProvider>,
  );
  await userEvent.type(screen.getByLabelText('Название упражнения'), 'Жим');
  await userEvent.type(screen.getByLabelText('Подходы'), '100');
  await userEvent.type(screen.getByLabelText('Повторения'), '1.5');
  expect(screen.getByText('От 1 до 99 подходов')).toBeVisible();
  expect(screen.getByText('Введите целое число повторов')).toBeVisible();
  expect(screen.getByLabelText('Подходы')).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByLabelText('Подходы')).toHaveAccessibleDescription('От 1 до 99 подходов');
  expect(screen.getByRole('button', { name: 'Добавить' })).toBeDisabled();
  await userEvent.clear(screen.getByLabelText('Подходы'));
  await userEvent.type(screen.getByLabelText('Подходы'), '3');
  await userEvent.clear(screen.getByLabelText('Повторения'));
  await userEvent.type(screen.getByLabelText('Повторения'), '10');
  await userEvent.click(screen.getByRole('button', { name: 'Добавить' }));
  expect(submit).toHaveBeenCalledWith(expect.objectContaining({ sets: 3, reps: 10 }));
});
it('keeps an excessively long day name for correction with an explanation', async () => {
  const submit = vi.fn();
  render(<DayModal mode="add" canAdd onSubmit={submit} onClose={vi.fn()} />);
  await userEvent.type(screen.getByLabelText('Название дня'), 'я'.repeat(101));
  expect(screen.getByText('Максимум 100 символов')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Добавить' }));
  expect(submit).not.toHaveBeenCalled();
});
