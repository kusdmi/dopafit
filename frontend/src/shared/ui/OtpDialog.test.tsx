import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { OtpDialog } from './OtpDialog';

describe('OtpDialog', () => {
  it('renders the title, contact hint and passes the code through', () => {
    const onComplete = vi.fn();
    render(
      <OtpDialog
        isOpen
        title="Подтвердите действие"
        contact="user@example.com"
        onComplete={onComplete}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Подтвердите действие')).toBeInTheDocument();
    expect(screen.getByText('Код отправлен на user@example.com')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Код подтверждения'), {
      target: { value: '000000' },
    });
    expect(onComplete).toHaveBeenCalledExactlyOnceWith('000000');
  });

  it('is hidden when closed and cancels via the button', () => {
    const onCancel = vi.fn();
    const { rerender } = render(
      <OtpDialog
        isOpen={false}
        title="Подтвердите действие"
        contact={null}
        onComplete={() => {}}
        onCancel={onCancel}
      />,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    rerender(
      <OtpDialog
        isOpen
        title="Подтвердите действие"
        contact={null}
        onComplete={() => {}}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
