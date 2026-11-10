import { describe, expect, it } from 'vitest';

import { measurementFormSchema } from './schema';

describe('measurementFormSchema', () => {
  it('rejects when only date is filled', () => {
    const result = measurementFormSchema.safeParse({ date: '2026-06-13' });
    expect(result.success).toBe(false);
  });

  it('accepts date plus one value', () => {
    const result = measurementFormSchema.safeParse({ date: '2026-06-13', weight: 80.5 });
    expect(result.success).toBe(true);
  });
});

it.each([-1, 10000, 9999.99, Infinity])('rejects an invalid measurement %s', (weight) => {
  expect(measurementFormSchema.safeParse({ date: '2026-06-13', weight }).success).toBe(false);
});
it('validates custom values without silently dropping invalid text', () => {
  expect(
    measurementFormSchema.safeParse({
      date: '2026-06-13',
      custom_values: [{ slot: 1, name: 'Тест', unit: 'см', value: 'abc' }],
    }).success,
  ).toBe(false);
  expect(measurementFormSchema.parse({ date: '2026-06-13', weight: 0 }).weight).toBe(0);
});
