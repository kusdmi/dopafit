import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SetLogger } from './SetLogger';

describe('SetLogger', () => {
  it('submits weight and reps', async () => {
    const onAdd = vi.fn();
    render(<SetLogger onAdd={onAdd} />);
    await userEvent.type(screen.getByLabelText('КГ'), '50');
    await userEvent.type(screen.getByLabelText('Повторы'), '10');
    await userEvent.click(screen.getByRole('button', { name: 'Добавить' }));
    expect(onAdd).toHaveBeenCalledWith({ weight: 50, reps: 10 });
  });

  // `reset({weight: undefined})` не очищал поля: react-hook-form пропускает
  // ключи со значением `undefined`, и в инпутах оставался предыдущий подход.
  it('clears both fields after a submit', async () => {
    render(<SetLogger onAdd={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('КГ'), '50');
    await userEvent.type(screen.getByLabelText('Повторы'), '10');
    await userEvent.click(screen.getByRole('button', { name: 'Добавить' }));

    expect(screen.getByLabelText('КГ')).toHaveValue('');
    expect(screen.getByLabelText('Повторы')).toHaveValue(null);
    // Форма снова пустая, значит и отправлять нечего.
    expect(screen.getByRole('button', { name: 'Добавить' })).toBeDisabled();
  });

  it('disables add until both fields are filled', () => {
    render(<SetLogger onAdd={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Добавить' })).toBeDisabled();
  });

  it('submits from the keyboard and clears both fields', async () => {
    const onAdd = vi.fn();
    render(<SetLogger onAdd={onAdd} />);
    await userEvent.type(screen.getByLabelText('КГ'), '42.5');
    await userEvent.type(screen.getByLabelText('Повторы'), '8{Enter}');
    expect(onAdd).toHaveBeenCalledExactlyOnceWith({ weight: 42.5, reps: 8 });
    expect(screen.getByLabelText('КГ')).toHaveValue('');
    expect(screen.getByLabelText('Повторы')).toHaveValue(null);
  });
});

it('shows field errors and never converts an empty weight into zero', async () => {
  const onAdd = vi.fn();
  render(<SetLogger onAdd={onAdd} />);
  await userEvent.type(screen.getByLabelText('Повторы'), '10');
  expect(screen.getByRole('button', { name: 'Добавить' })).toBeDisabled();
  await userEvent.type(screen.getByLabelText('КГ'), '2001');
  expect(await screen.findByText('Вес от 0 до 2000 кг')).toBeVisible();
  expect(screen.getByLabelText('КГ')).toHaveAccessibleDescription('Вес от 0 до 2000 кг');
  await userEvent.clear(screen.getByLabelText('КГ'));
  await userEvent.type(screen.getByLabelText('КГ'), '12,25');
  await userEvent.click(screen.getByRole('button', { name: 'Добавить' }));
  expect(onAdd).toHaveBeenCalledWith({ weight: 12.25, reps: 10 });
});
