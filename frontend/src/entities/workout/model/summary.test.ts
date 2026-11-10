import { describe, expect, it } from 'vitest';
import { computeLocalSummary } from './summary';
import type { LocalSet, WorkoutSlot } from './types';

const slots: WorkoutSlot[] = [
  { slotId: 'sl1', variantId: 'v1', name: 'Жим', sets: 3, reps: 10, alternatives: [] },
];

describe('computeLocalSummary', () => {
  it('computes duration, avg rest and per-exercise max/avg/min', () => {
    const sets: LocalSet[] = [
      { id: 'a', slotId: 'sl1', variantId: 'v1', weight: 50, reps: 10, performedAt: '2026-06-16T10:00:00Z' },
      { id: 'b', slotId: 'sl1', variantId: 'v1', weight: 60, reps: 8, performedAt: '2026-06-16T10:02:00Z' },
    ];
    const r = computeLocalSummary({
      startedAt: '2026-06-16T10:00:00Z',
      finishedAt: '2026-06-16T10:30:00Z',
      slots,
      sets,
    });
    expect(r.durationSeconds).toBe(1800);
    expect(r.avgRestSeconds).toBe(120);
    expect(r.exercises[0].name).toBe('Жим');
    expect(r.exercises[0].max).toBe(60);
    expect(r.exercises[0].avg).toBe(55);
    expect(r.exercises[0].min).toBe(50);
  });

  it('returns null avg rest for a single set and empty exercises for no sets', () => {
    const r = computeLocalSummary({
      startedAt: '2026-06-16T10:00:00Z',
      finishedAt: '2026-06-16T10:10:00Z',
      slots,
      sets: [],
    });
    expect(r.durationSeconds).toBe(600);
    expect(r.avgRestSeconds).toBeNull();
    expect(r.exercises).toEqual([]);
  });
});
