import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useCodeCooldown } from './use-code-cooldown';

// Форма ошибки, которую реально парсит retryAfterSeconds (см. client.ts):
// code === 'rate_limited' + details.retry_after_seconds.
const rateLimited = (seconds: number) => ({
  code: 'rate_limited',
  message: 'Слишком часто',
  details: { retry_after_seconds: seconds },
});

describe('useCodeCooldown', () => {
  it('успех запроса кода: cooldown сбрасывается на 60 и onOk вызывается', () => {
    const { result } = renderHook(() => useCodeCooldown());
    const onOk = vi.fn();
    const onThrottled = vi.fn();

    // Занизим cooldown, чтобы увидеть сброс к 60.
    act(() => result.current.setCooldown(7));
    expect(result.current.cooldown).toBe(7);

    act(() => result.current.handlers(onOk, onThrottled).onSuccess());

    expect(result.current.cooldown).toBe(60);
    expect(onOk).toHaveBeenCalledTimes(1);
    expect(onThrottled).not.toHaveBeenCalled();
  });

  it('429 с retry_after: cooldown = retry и onThrottled вызывается', () => {
    const { result } = renderHook(() => useCodeCooldown());
    const onOk = vi.fn();
    const onThrottled = vi.fn();

    act(() => result.current.handlers(onOk, onThrottled).onError(rateLimited(42)));

    expect(result.current.cooldown).toBe(42);
    expect(onThrottled).toHaveBeenCalledTimes(1);
    expect(onOk).not.toHaveBeenCalled();
  });

  it('НЕ-429 ошибка: cooldown не меняется, onThrottled НЕ вызывается', () => {
    const { result } = renderHook(() => useCodeCooldown());
    const onOk = vi.fn();
    const onThrottled = vi.fn();

    act(() =>
      result.current
        .handlers(onOk, onThrottled)
        .onError({ code: 'validation_error', message: 'Ошибка' }),
    );

    expect(result.current.cooldown).toBe(60);
    expect(onThrottled).not.toHaveBeenCalled();
    expect(onOk).not.toHaveBeenCalled();
  });
});
