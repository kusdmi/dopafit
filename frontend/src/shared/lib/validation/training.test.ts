import { describe, expect, it } from 'vitest';
import { repsSchema, setsSchema, weightSchema, trainingNameSchema } from './training';
import { trainingError } from './training-errors';
import type { components } from '@/shared/api/schema';

describe('training field constraints', () => {
  it.each(['', ' ', '-1', '2001', 'Infinity', 'NaN', '1e2', '12,3,4'])(
    'rejects invalid weight %s',
    (value) => {
      expect(weightSchema.safeParse(value).success).toBe(false);
    },
  );
  it.each([
    ['0', 0],
    ['2000', 2000],
    ['12.5', 12.5],
    ['12,5', 12.5],
    ['12.25', 12.25],
  ] as const)('accepts weight %s without rounding', (input, output) => {
    expect(weightSchema.parse(input)).toBe(output);
  });
  it.each(['', '0', '-1', '1.5', '1000'])('rejects invalid reps %s', (value) => {
    expect(repsSchema.safeParse(value).success).toBe(false);
  });
  it('matches the set and repetition boundaries', () => {
    expect(setsSchema.parse('99')).toBe(99);
    expect(setsSchema.safeParse('100').success).toBe(false);
    expect(repsSchema.parse('999')).toBe(999);
    expect(repsSchema.parse('1')).toBe(1);
  });
  it('trims names and rejects blank or excessively long names', () => {
    expect(trainingNameSchema(100).parse(' День 1 ')).toBe('День 1');
    expect(trainingNameSchema(100).safeParse(' ').success).toBe(false);
    expect(trainingNameSchema(100).safeParse('я'.repeat(101)).success).toBe(false);
    expect(trainingNameSchema(255).safeParse('я'.repeat(255)).success).toBe(true);
    expect(trainingNameSchema(255).safeParse('я'.repeat(256)).success).toBe(false);
  });
  it('maps nested server errors to stable exercise identifiers', () => {
    const program = {
      id: 'program',
      kind: 'strength',
      name: 'Сила',
      days: [
        {
          id: 'day',
          name: 'День 1',
          position: 0,
          slots: [
            {
              position: 0,
              exercises: [
                { id: 'exercise', custom_name: 'Жим', sets: 100, reps: 1.5, variant_order: 0 },
              ],
            },
          ],
        },
      ],
    } satisfies components['schemas']['ProgramCreate'];
    const result = trainingError(
      {
        code: 'validation_error',
        details: [
          { path: ['days', 0, 'slots', 0, 'exercises', 0, 'sets'] },
          { path: ['days', 0, 'slots', 0, 'exercises', 0, 'reps'] },
        ],
      },
      program,
    );
    expect(result.message).toContain('День «День 1», упражнение 1');
    expect(result.fields['exercise:sets']).toBe('От 1 до 99 подходов');
    expect(result.fields['exercise:reps']).toBe('Введите целое число повторов');
  });
  it.each([null, {}, 'unexpected', [{ path: null }], [{ path: ['days', 999] }]])(
    'handles unknown server details safely',
    (details) => {
      expect(trainingError({ code: 'validation_error', details }).message).toContain('Проверьте');
    },
  );
  it('distinguishes quota, conflict and connection errors', () => {
    expect(
      trainingError({ code: 'forbidden', details: { reason: 'program_limit' } }).message,
    ).toContain('лимит программ');
    expect(trainingError({ code: 'conflict' }).message).toContain('другом окне');
    expect(trainingError({ code: 'network_error' }).message).toContain('связаться');
  });
});
