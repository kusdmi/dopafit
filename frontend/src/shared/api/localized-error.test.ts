import { describe, expect, it } from 'vitest';
import { toApiError } from './client';

describe('Russian API errors by stable identifiers', () => {
  it.each(['Code was sent recently', 'Текст изменён', '', 'unrelated diagnostics'])(
    'ignores server wording: %s',
    (message) => {
      expect(
        toApiError({
          code: 'rate_limited',
          message,
          details: { reason: 'code_send_cooldown', retry_after_seconds: 60 },
        }),
      ).toEqual({
        code: 'rate_limited',
        message: 'Код уже запрошен. Дождитесь повторной отправки',
        details: { reason: 'code_send_cooldown', retry_after_seconds: 60 },
      });
    },
  );
  it.each([
    undefined,
    null,
    [],
    { reason: 42 },
    { reason: 'future_reason' },
    { reason: '__proto__' },
    { reason: 'toString' },
  ])('uses the code fallback for unknown details: %j', (details) => {
    expect(toApiError({ code: 'validation_error', message: 'Укажите имя', details }).message).toBe(
      'Проверьте введённые данные',
    );
  });
  it('never exposes diagnostics for unknown codes', () => {
    expect(toApiError({ code: 'unknown', message: 'Something failed' }).message).toBe(
      'Не удалось выполнить действие. Попробуйте ещё раз',
    );
  });
});
