import { describe, expect, it } from 'vitest';

import { isBirthDateInRange, physicalSchema, toOnboardingRequest, trainerSchema } from './schemas';

/** Дата ровно N лет назад от сегодня. */
function yearsAgo(years: number, dayShift = 0) {
  const now = new Date();
  const date = new Date(
    Date.UTC(now.getUTCFullYear() - years, now.getUTCMonth(), now.getUTCDate() + dayShift),
  );
  return date.toISOString().slice(0, 10);
}

describe('isBirthDateInRange', () => {
  it('принимает дату внутри допустимого возраста', () => {
    expect(isBirthDateInRange('1990-04-17')).toBe(true);
    expect(isBirthDateInRange(yearsAgo(10))).toBe(true);
    expect(isBirthDateInRange(yearsAgo(120))).toBe(true);
  });

  it('отклоняет слишком юный и слишком большой возраст', () => {
    expect(isBirthDateInRange(yearsAgo(10, 1))).toBe(false);
    expect(isBirthDateInRange(yearsAgo(120, -1))).toBe(false);
  });

  it('отклоняет будущую дату и мусор', () => {
    expect(isBirthDateInRange(yearsAgo(-1))).toBe(false);
    expect(isBirthDateInRange('')).toBe(false);
    expect(isBirthDateInRange('не дата')).toBe(false);
  });
});

describe('toOnboardingRequest', () => {
  it('передаёт дату рождения в запрос как есть, без вычислений', () => {
    const values = physicalSchema.parse({
      gender: 'female',
      birth_date: '1990-04-17',
      weight: '70',
      height: '175',
    });

    expect(toOnboardingRequest(values, '')).toEqual({
      gender: 'female',
      birth_date: '1990-04-17',
      weight: 70,
      height: 175,
      clients_per_month: null,
    });
  });
});

it('rejects a fractional client count during trainer onboarding', () => {
  expect(trainerSchema.safeParse({ clients_per_month: '1.5' }).success).toBe(false);
  expect(trainerSchema.parse({ clients_per_month: '10' }).clients_per_month).toBe('10');
});
