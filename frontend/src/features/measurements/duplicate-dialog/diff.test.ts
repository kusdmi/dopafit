import { describe, expect, it } from 'vitest';

import { diffCustomValues, diffMeasurements } from './diff';

describe('diffMeasurements', () => {
  it('lists only changed fields with before/after', () => {
    const before = { weight: 82, waist: 88, chest: undefined };
    const after = { weight: 80.5, waist: 88, chest: 102 };
    const rows = diffMeasurements(before, after);
    const byField = Object.fromEntries(rows.map((r) => [r.field, r]));
    expect(byField.weight).toEqual({ field: 'weight', label: 'Вес', before: 82, after: 80.5 });
    expect(byField.chest).toEqual({ field: 'chest', label: 'Грудь', before: undefined, after: 102 });
    expect(byField.waist).toBeUndefined(); // unchanged
  });

  it('treats null (server) and undefined (form) empty values as unchanged', () => {
    // Backend returns null for empty numeric fields; the form holds undefined.
    const before = { weight: null, waist: 88 } as Record<string, number | null | undefined>;
    const after = { weight: undefined, waist: 88 };
    const rows = diffMeasurements(before, after);
    // Neither weight nor waist actually changed, so no rows.
    expect(rows).toEqual([]);
  });

  it('still reports a real change from a value to empty', () => {
    const before = { weight: 80 };
    const after = { weight: undefined };
    const rows = diffMeasurements(before, after);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ field: 'weight', before: 80, after: undefined });
  });
});

describe('diffCustomValues', () => {
  it('reports a slot whose value changed (label carries the unit)', () => {
    const before = [{ slot: 1, name: 'Жир %', unit: '%', value: 15 }];
    const after = [{ slot: 1, name: 'Жир %', unit: '%', value: 16 }];
    const rows = diffCustomValues(before, after);
    expect(rows).toEqual([
      { slot: 1, label: 'Жир %', unit: '%', before: 15, after: 16 },
    ]);
  });

  it('ignores custom slots whose value is unchanged', () => {
    const before = [{ slot: 2, name: 'Пульс', unit: 'уд', value: 60 }];
    const after = [{ slot: 2, name: 'Пульс', unit: 'уд', value: 60 }];
    expect(diffCustomValues(before, after)).toEqual([]);
  });

  it('reports an added value (before undefined) and a removed value (after undefined)', () => {
    const before = [{ slot: 1, name: 'Жир %', unit: '%', value: 15 }];
    const after = [{ slot: 3, name: 'Вода', unit: 'л', value: 40 }];
    const rows = diffCustomValues(before, after);
    // slot 1 removed, slot 3 added — sorted by slot.
    expect(rows).toEqual([
      { slot: 1, label: 'Жир %', unit: '%', before: 15, after: undefined },
      { slot: 3, label: 'Вода', unit: 'л', before: undefined, after: 40 },
    ]);
  });

  it('reports a rename-only change (same value) so the dialog is not empty (Minor-2)', () => {
    const before = [{ slot: 1, name: 'Жир', unit: '%', value: 15 }];
    const after = [{ slot: 1, name: 'Жир %', unit: '%', value: 15 }];
    const rows = diffCustomValues(before, after);
    expect(rows).toEqual([
      { slot: 1, label: 'Жир %', labelBefore: 'Жир', unit: '%', before: 15, after: 15 },
    ]);
  });

  it('reports a unit-only change (same value)', () => {
    const before = [{ slot: 1, name: 'Вода', unit: 'л', value: 40 }];
    const after = [{ slot: 1, name: 'Вода', unit: 'мл', value: 40 }];
    const rows = diffCustomValues(before, after);
    expect(rows).toEqual([
      { slot: 1, label: 'Вода', unit: 'мл', unitBefore: 'л', before: 40, after: 40 },
    ]);
  });

  it('handles null/undefined sides as no custom values', () => {
    expect(diffCustomValues(null, undefined)).toEqual([]);
    expect(
      diffCustomValues(undefined, [{ slot: 1, name: 'Жир %', unit: '%', value: 16 }]),
    ).toEqual([{ slot: 1, label: 'Жир %', unit: '%', before: undefined, after: 16 }]);
  });
});
