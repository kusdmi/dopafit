import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { DateInput } from './DateInput';

it('shows day-first dates while preserving ISO form values and native constraints', () => {
  const change = vi.fn();
  const { rerender } = render(
    <DateInput
      aria-label="Дата"
      value="2026-01-23"
      min="2026-01-01"
      max="2026-12-31"
      onChange={change}
    />,
  );
  expect(screen.getByText('23.01.2026')).toBeInTheDocument();
  const input = screen.getByLabelText('Дата');
  expect(input).toHaveValue('2026-01-23');
  expect(input).toHaveAttribute('min', '2026-01-01');
  expect(input).toHaveAttribute('max', '2026-12-31');
  fireEvent.change(input, { target: { value: '2026-03-04' } });
  expect(change).toHaveBeenCalledOnce();
  rerender(<DateInput aria-label="Дата" value="2026-03-04" onChange={change} />);
  expect(screen.getByText('04.03.2026')).toBeInTheDocument();
  rerender(<DateInput aria-label="Дата" value="" onChange={change} />);
  expect(screen.getByText('ДД.ММ.ГГГГ')).toBeInTheDocument();
});

it('updates the visible date for uncontrolled profile fields', () => {
  render(<DateInput aria-label="Дата рождения" defaultValue="1990-05-15" name="birth_date" />);
  expect(screen.getByText('15.05.1990')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Дата рождения'), { target: { value: '1992-12-31' } });
  expect(screen.getByText('31.12.1992')).toBeInTheDocument();
});
