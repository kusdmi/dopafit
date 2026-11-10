import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDelayedVisible } from './useDelayedVisible';

describe('useDelayedVisible', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('stays hidden while loading is shorter than the delay (no flash)', () => {
    const { result, rerender } = renderHook(({ loading }) => useDelayedVisible(loading), {
      initialProps: { loading: true },
    });
    expect(result.current).toBe(false);

    // Быстрый ответ до порога delay — индикатор так и не появляется.
    act(() => {
      vi.advanceTimersByTime(150);
    });
    rerender({ loading: false });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(false);
  });

  it('shows the indicator once loading passes the delay threshold', () => {
    const { result } = renderHook(() => useDelayedVisible(true));
    expect(result.current).toBe(false);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe(true);
  });

  it('keeps the indicator visible for the minimum duration (no blink)', () => {
    const { result, rerender } = renderHook(({ loading }) => useDelayedVisible(loading), {
      initialProps: { loading: true },
    });
    // Показали после delay.
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe(true);

    // Загрузка завершилась почти сразу — держим минимум ~450мс.
    rerender({ loading: false });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe(true);

    act(() => {
      vi.advanceTimersByTime(450);
    });
    expect(result.current).toBe(false);
  });

  it('respects custom delay and minVisible options', () => {
    const { result, rerender } = renderHook(
      ({ loading }) => useDelayedVisible(loading, { delayMs: 50, minVisibleMs: 100 }),
      { initialProps: { loading: true } },
    );
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(result.current).toBe(true);

    rerender({ loading: false });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe(false);
  });

  it('hides immediately when loading finished before the indicator ever showed', () => {
    const { result, rerender } = renderHook(({ loading }) => useDelayedVisible(loading), {
      initialProps: { loading: true },
    });
    rerender({ loading: false });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(false);
  });
});
