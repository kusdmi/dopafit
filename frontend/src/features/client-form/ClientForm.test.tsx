import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { it, expect, vi } from 'vitest';
import { ClientForm } from './ClientForm';
it('explains client name and phone limits before saving', async () => {
  const save = vi.fn();
  render(<ClientForm submitLabel="Сохранить" onSave={save} />);
  await userEvent.type(screen.getByLabelText('Имя клиента'), 'я'.repeat(101));
  await userEvent.type(screen.getByLabelText('Телефон'), '123');
  expect(screen.getByText('Максимум 100 символов')).toBeVisible();
  expect(screen.getByText('Телефон: + и от 10 до 15 цифр')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled();
  expect(save).not.toHaveBeenCalled();
});
