import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FeedbackHost, useToast } from './feedback';

/** Renders FeedbackHost plus a trigger that fires useToast, for driving the toast store. */
function Harness({ message }: { message: string }) {
  const [present] = useToast();
  return (
    <>
      <button type="button" onClick={() => void present(message)}>
        show
      </button>
      <FeedbackHost />
    </>
  );
}

describe('FeedbackHost toast leave-timer cleanup', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not leave a pending leave-animation timer running after unmount', () => {
    vi.useFakeTimers();
    const { getByText, unmount } = render(<Harness message="hello" />);

    act(() => {
      getByText('show').click();
    });
    // Unmounting while the toast is still current triggers the leave-timer
    // cleanup path (setTimeout scheduled from the effect's cleanup function).
    unmount();

    // Without the fix, the leave-animation setTimeout scheduled inside the
    // cleanup has no captured id, so it is never cleared and stays pending
    // in the fake-timer queue after unmount.
    expect(vi.getTimerCount()).toBe(0);
  });

  it('calling the same cleanup twice in a row (StrictMode-style double-invoke) does not throw', () => {
    // Guards the ref-based clearTimeout guard itself: a second cleanup run
    // must see leaveTimerRef already cleared and just no-op.
    vi.useFakeTimers();
    const { getByText, rerender, unmount } = render(<Harness message="a" />);
    act(() => {
      getByText('show').click();
    });
    rerender(<Harness message="b" />);
    act(() => {
      getByText('show').click();
    });
    expect(() => unmount()).not.toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('still plays the leave animation (leavingToast) when swapping toasts normally', () => {
    vi.useFakeTimers();
    const { getByText, queryByRole, rerender } = render(<Harness message="first" />);

    act(() => {
      getByText('show').click();
    });
    expect(queryByRole('status')?.textContent).toBe('first');

    // Swap to a second toast: the first toast's per-toast effect cleanup should
    // schedule the leave animation for 'first' without throwing, and the new
    // toast should render immediately (current always wins over leaving).
    rerender(<Harness message="second" />);
    act(() => {
      getByText('show').click();
    });
    expect(queryByRole('status')?.textContent).toBe('second');

    // After the leave duration elapses, only the live toast remains.
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(queryByRole('status')?.textContent).toBe('second');
  });
});
