import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog', () => {
  it('renders title and labels, fires callbacks', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        isOpen
        title="Завершить тренировку?"
        confirmLabel="Да"
        cancelLabel="Нет"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByText('Завершить тренировку?')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Да'));
    expect(onConfirm).toHaveBeenCalled();
    fireEvent.click(screen.getByText('Нет'));
    expect(onCancel).toHaveBeenCalled();
  });
});
