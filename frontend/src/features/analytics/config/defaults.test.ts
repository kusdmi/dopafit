import { describe, expect, it } from 'vitest';

import { migrateConfig, makeDefaultConfig } from './defaults';

describe('analytics config defaults', () => {
  it('produces a default config with the two current charts and 90d period', () => {
    const config = makeDefaultConfig();
    expect(config.version).toBe(1);
    expect(config.default_period).toBe('90d');
    expect(config.charts.map((c) => c.type)).toEqual(['workouts', 'anthropometry']);
    expect(config.charts.every((c) => c.visible)).toBe(true);
    expect(config.charts.every((c) => typeof c.id === 'string' && c.id.length > 0)).toBe(true);
  });

  it('falls back to the default config when raw is null or undefined', () => {
    expect(migrateConfig(null).charts.length).toBe(2);
    expect(migrateConfig(undefined).charts.length).toBe(2);
  });

  it('falls back to the default config when raw is structurally broken', () => {
    expect(
      migrateConfig({ version: 1, default_period: '90d', charts: 'nope' } as never).charts.length,
    ).toBe(2);
  });

  it('passes a valid config through unchanged (same chart ids)', () => {
    const valid = makeDefaultConfig();
    const out = migrateConfig(valid);
    expect(out.charts.map((c) => c.id)).toEqual(valid.charts.map((c) => c.id));
  });

  // migrateConfig rebuilds the object field by field, so every optional key has
  // to be copied EXPLICITLY — one that is merely declared on the type is
  // silently dropped on read. That bit the home strength picker: the id was
  // written to the server and vanished on the way back, so the chart kept
  // following the personal record. Keep a case per home preference.
  it('keeps the home screen preferences stored in the free-form config', () => {
    const stored = {
      ...makeDefaultConfig(),
      home_measurement_parameter: 'waist',
      home_strength_exercise_id: 'e927f811-bd01-4b72-8467-2876e0661318',
      home_record_exercise_id: '3f2a1c55-90de-4f1b-9a77-0c1d2e3f4a5b',
    };
    const out = migrateConfig(stored);
    expect(out.home_measurement_parameter).toBe('waist');
    expect(out.home_strength_exercise_id).toBe('e927f811-bd01-4b72-8467-2876e0661318');
    expect(out.home_record_exercise_id).toBe('3f2a1c55-90de-4f1b-9a77-0c1d2e3f4a5b');
  });

  // Карточка рекорда и график силового прогресса — два РАЗНЫХ выбора, и хранятся
  // они в разных ключах. Раньше ключ был один: выбор рекорда вверху молча
  // переставлял график внизу.
  it('keeps the record and the strength chart choices apart', () => {
    const out = migrateConfig({
      ...makeDefaultConfig(),
      home_strength_exercise_id: 'aaaaaaaa-0000-4000-8000-000000000001',
      home_record_exercise_id: 'bbbbbbbb-0000-4000-8000-000000000002',
    });
    expect(out.home_strength_exercise_id).not.toBe(out.home_record_exercise_id);
  });
});
