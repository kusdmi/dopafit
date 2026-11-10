import { fireEvent, render, screen, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OtpInput } from './OtpInput';

const input = () => screen.getByLabelText<HTMLInputElement>('Код подтверждения');

describe('OtpInput', () => {
  it('exposes ONE autofill-ready input under the cells', () => {
    render(<OtpInput onComplete={() => {}} />);
    const field = input();
    expect(field).toHaveAttribute('autocomplete', 'one-time-code');
    expect(field).toHaveAttribute('inputmode', 'numeric');
    expect(field).toHaveAttribute('maxlength', '6');
    // exactly one real input — the visual cells are aria-hidden divs
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
  });

  it('focuses the input on mount', () => {
    render(<OtpInput onComplete={() => {}} />);
    expect(input()).toHaveFocus();
  });

  it('fills the cells and calls onComplete once on the 6th digit', () => {
    const onComplete = vi.fn();
    render(<OtpInput onComplete={onComplete} />);
    fireEvent.change(input(), { target: { value: '123' } });
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.change(input(), { target: { value: '123456' } });
    expect(onComplete).toHaveBeenCalledExactlyOnceWith('123456');
    expect(screen.getByText('6')).toBeInTheDocument();
  });

  it('forces the caret to the end on focus and select (append-only editing)', () => {
    render(<OtpInput onComplete={() => {}} />);
    const field = input();
    fireEvent.change(field, { target: { value: '123' } });

    // Simulate a tap on a middle cell placing the caret at index 1.
    field.setSelectionRange(1, 1);
    fireEvent.select(field);
    expect(field.selectionStart).toBe(3);
    expect(field.selectionEnd).toBe(3);

    field.setSelectionRange(0, 0);
    fireEvent.focus(field);
    expect(field.selectionStart).toBe(3);
  });

  it('filters non-digits from pasted content', () => {
    const onComplete = vi.fn();
    render(<OtpInput onComplete={onComplete} />);
    fireEvent.change(input(), { target: { value: '12 34-5a6' } });
    expect(onComplete).toHaveBeenCalledExactlyOnceWith('123456');
  });

  it('shows the error, clears the value and shakes', () => {
    const { rerender } = render(<OtpInput onComplete={() => {}} />);
    fireEvent.change(input(), { target: { value: '999999' } });
    rerender(<OtpInput onComplete={() => {}} error="Неверный или просроченный код" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Неверный или просроченный код');
    expect(input().value).toBe('');
    expect(document.querySelector('.otp-shake')).not.toBeNull();
  });

  it('shakes and clears again on a second error with the same message', () => {
    const message = 'Неверный или просроченный код';
    const { rerender } = render(<OtpInput onComplete={() => {}} />);

    // First wrong attempt.
    fireEvent.change(input(), { target: { value: '999999' } });
    rerender(<OtpInput onComplete={() => {}} error={message} />);
    expect(input().value).toBe('');
    const firstRow = document.querySelector('.otp-shake');
    expect(firstRow).not.toBeNull();

    // A new verify clears the error first (TanStack mutate resets it), then the
    // same message arrives again — the row must clear and replay the shake.
    rerender(<OtpInput onComplete={() => {}} />);
    fireEvent.change(input(), { target: { value: '888888' } });
    expect(input().value).toBe('888888');
    rerender(<OtpInput onComplete={() => {}} error={message} />);
    expect(input().value).toBe('');
    const secondRow = document.querySelector('.otp-shake');
    expect(secondRow).not.toBeNull();
    expect(secondRow).not.toBe(firstRow); // keyed remount replayed the animation
  });

  describe('resend countdown', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('starts the resend cooldown only after CAPTCHA and delivery succeed', async () => {
      let resolve!: () => void;
      const pending = new Promise<void>((done) => {
        resolve = done;
      });
      render(<OtpInput onComplete={() => {}} onResend={() => pending} resendCooldownSeconds={3} />);
      act(() => vi.advanceTimersByTime(3000));
      fireEvent.click(screen.getByRole('button', { name: 'Отправить ещё раз' }));
      expect(screen.getByRole('button', { name: 'Отправить ещё раз' })).toBeDisabled();
      await act(async () => {
        resolve();
        await pending;
      });
      expect(screen.getByRole('button', { name: 'Отправить ещё раз (0:03)' })).toBeDisabled();
    });

    it('shows delivery errors and permits immediate retry after CAPTCHA cancellation', async () => {
      const onResend = vi
        .fn()
        .mockRejectedValueOnce({ code: 'captcha_cancelled', message: 'Проверка отменена' })
        .mockRejectedValueOnce({
          code: 'validation_error',
          message: 'Не удалось отправить письмо',
          details: { reason: 'email_delivery_failed' },
        });
      render(<OtpInput onComplete={() => {}} onResend={onResend} resendCooldownSeconds={1} />);
      act(() => vi.advanceTimersByTime(1000));
      await act(async () =>
        fireEvent.click(screen.getByRole('button', { name: 'Отправить ещё раз' })),
      );
      expect(screen.getByRole('alert')).toHaveTextContent('Проверка отменена');
      expect(screen.getByRole('button', { name: 'Отправить ещё раз' })).toBeEnabled();
      await act(async () =>
        fireEvent.click(screen.getByRole('button', { name: 'Отправить ещё раз' })),
      );
      expect(screen.getByRole('alert')).toHaveTextContent('Не удалось отправить письмо');
    });

    it('locks resend for the cooldown, then unlocks and restarts on click', () => {
      const onResend = vi.fn();
      render(<OtpInput onComplete={() => {}} onResend={onResend} resendCooldownSeconds={3} />);
      const button = screen.getByRole('button', { name: 'Отправить ещё раз (0:03)' });
      expect(button).toBeDisabled();

      act(() => {
        vi.advanceTimersByTime(3000);
      });
      const unlocked = screen.getByRole('button', { name: 'Отправить ещё раз' });
      expect(unlocked).toBeEnabled();

      fireEvent.click(unlocked);
      expect(onResend).toHaveBeenCalledOnce();
      expect(screen.getByRole('button', { name: 'Отправить ещё раз (0:03)' })).toBeDisabled();
    });

    it('restarts the countdown when the parent bumps the cooldown from a 429', () => {
      const { rerender } = render(
        <OtpInput onComplete={() => {}} onResend={() => {}} resendCooldownSeconds={1} />,
      );
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(screen.getByRole('button', { name: 'Отправить ещё раз' })).toBeEnabled();
      rerender(<OtpInput onComplete={() => {}} onResend={() => {}} resendCooldownSeconds={42} />);
      expect(screen.getByRole('button', { name: 'Отправить ещё раз (0:42)' })).toBeDisabled();
    });
  });
});
