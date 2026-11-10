import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { Dialog } from './primitives';

it('keeps focus in the current field when a dialog rerenders', () => {
  const { rerender } = render(<Dialog isOpen onClose={() => {}}><input aria-label="Первое" /><input aria-label="Второе" /></Dialog>);
  screen.getByLabelText('Второе').focus();
  rerender(<Dialog isOpen onClose={() => {}}><input aria-label="Первое" /><input aria-label="Второе" /></Dialog>);
  expect(screen.getByLabelText('Второе')).toHaveFocus();
});
it('traps tab focus and allows Escape dismissal', () => {
  const close = vi.fn();
  render(<Dialog isOpen onClose={close}><input aria-label="Первое" /><button>Последнее</button></Dialog>);
  screen.getByRole('button').focus();
  fireEvent.keyDown(screen.getByRole('button'), { key: 'Tab' });
  expect(screen.getByLabelText('Первое')).toHaveFocus();
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(close).toHaveBeenCalledOnce();
});
