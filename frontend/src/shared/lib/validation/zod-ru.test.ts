import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { setupZodRu } from './zod-ru';

setupZodRu();

describe('zod russian error map', () => {
  function firstError(result: z.ZodSafeParseResult<unknown>): string {
    expect(result.success).toBe(false);
    return result.success ? '' : result.error.issues[0].message;
  }

  it('translates a missing required string', () => {
    expect(firstError(z.string().safeParse(undefined))).toBe('Обязательное поле');
  });

  it('translates min(1) on a string as required', () => {
    expect(firstError(z.string().min(1).safeParse(''))).toBe('Обязательное поле');
  });

  it('translates a too-short string', () => {
    expect(firstError(z.string().min(2).safeParse('a'))).toBe('Минимум 2 символов');
  });

  it('translates a too-long string', () => {
    expect(firstError(z.string().max(3).safeParse('abcd'))).toBe('Максимум 3 символов');
  });

  it('translates a number below the minimum', () => {
    expect(firstError(z.number().min(0).safeParse(-1))).toBe('Минимальное значение — 0');
  });

  it('translates a number above the maximum', () => {
    expect(firstError(z.number().max(10).safeParse(20))).toBe('Максимальное значение — 10');
  });

  it('translates a bad email', () => {
    expect(firstError(z.email().safeParse('nope'))).toBe('Введите корректный email');
  });

  it('translates a regex mismatch', () => {
    expect(firstError(z.string().regex(/^\d+$/).safeParse('abc'))).toBe('Некорректный формат');
  });

  it('translates an invalid enum option', () => {
    expect(firstError(z.enum(['a', 'b']).safeParse('c'))).toBe('Выберите значение из списка');
  });

  it('keeps an explicit per-field russian message instead of the global map', () => {
    expect(firstError(z.string().min(2, 'Введите имя').safeParse('a'))).toBe('Введите имя');
  });

  it('translates a coerced NaN number as required', () => {
    expect(firstError(z.coerce.number().safeParse('not-a-number'))).toBe('Обязательное поле');
  });
});
