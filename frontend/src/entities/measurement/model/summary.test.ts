import { describe, expect, it } from 'vitest';

import type { components } from '@/shared/api/schema';

import { summaryMetrics } from './summary';

type MeasurementOut = components['schemas']['MeasurementOut'];

const record = (fields: Partial<MeasurementOut>): MeasurementOut =>
  ({
    id: 'm1',
    date: '2026-01-16',
    updated_at: '2026-01-16T10:00:00Z',
    custom_values: [],
    photos: [],
    ...fields,
  }) as MeasurementOut;

describe('summaryMetrics', () => {
  it('shows the three headline metrics from the mock', () => {
    expect(summaryMetrics(record({ weight: 80, waist: 75, chest: 100, biceps: 38 }))).toEqual([
      { key: 'weight', label: 'Вес', unit: 'кг', value: 80 },
      { key: 'waist', label: 'Талия', unit: 'см', value: 75 },
      { key: 'chest', label: 'Грудь', unit: 'см', value: 100 },
    ]);
  });

  it('keeps only the headline metrics the record actually has', () => {
    expect(summaryMetrics(record({ weight: 80, biceps: 38 }))).toEqual([
      { key: 'weight', label: 'Вес', unit: 'кг', value: 80 },
    ]);
  });

  it('falls back to the other fields when no headline metric is present', () => {
    expect(summaryMetrics(record({ biceps: 38, neck: 40 }))).toEqual([
      { key: 'biceps', label: 'Бицепс', unit: 'см', value: 38 },
      { key: 'neck', label: 'Шея', unit: 'см', value: 40 },
    ]);
  });

  it('falls back to custom values so a custom-only record is never blank', () => {
    const custom = record({
      custom_values: [{ name: 'Бицепс левый', slot: 1, unit: 'см', value: 37.5 }],
    });
    expect(summaryMetrics(custom)).toEqual([
      { key: 'custom-1', label: 'Бицепс левый', unit: 'см', value: 37.5 },
    ]);
  });

  it('returns nothing for a record that carries no values at all', () => {
    expect(summaryMetrics(record({}))).toEqual([]);
  });
});
