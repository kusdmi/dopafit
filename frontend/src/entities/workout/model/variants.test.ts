import { describe, expect, it } from 'vitest';
import { useWorkoutStore } from './store';
import { computeLocalSummary } from './summary';
import { primaryVariantId } from './variants';
import type { WorkoutSlot } from './types';

const slot: WorkoutSlot = {
  slotId: 'slot',
  variantId: 'primary',
  name: 'Основное',
  sets: 3,
  reps: 8,
  alternatives: [
    { variantId: 'alt1', name: 'Вариант 1' },
    { variantId: 'alt2', name: 'Вариант 2' },
  ],
};

describe('workout variants', () => {
  it('can return to primary after any alternative without losing sets', () => {
    const store = useWorkoutStore.getState();
    store.reset();
    store.startSession({
      participant: { kind: 'self' },
      programId: 'program',
      dayId: 'day',
      slots: [slot],
    });
    for (const id of ['primary', 'alt1', 'alt2', 'primary']) {
      store.chooseVariant('slot', id);
      store.addSet({ slotId: 'slot', variantId: id, weight: 50, reps: 8 });
      expect(useWorkoutStore.getState().sessions.self.slots[0]).toMatchObject({
        variantId: id,
        primaryVariantId: 'primary',
      });
    }
    const session = useWorkoutStore.getState().sessions.self;
    const summary = computeLocalSummary({ ...session, finishedAt: new Date().toISOString() });
    expect(session.sets).toHaveLength(4);
    expect(summary.exercises.map((item) => item.name)).toEqual([
      'Основное',
      'Вариант 1',
      'Вариант 2',
    ]);
    store.chooseVariant('slot', 'unknown');
    expect(useWorkoutStore.getState().sessions.self.slots[0].variantId).toBe('primary');
    store.reset();
  });
  it('recovers a legacy primary from sets, or waits for program data without inventing an id', () => {
    const legacy = { ...slot, variantId: 'alt1' };
    expect(primaryVariantId(legacy)).toBeUndefined();
    expect(
      primaryVariantId(legacy, [
        {
          id: 'set',
          slotId: 'slot',
          variantId: 'primary',
          weight: 50,
          reps: 8,
          performedAt: '2026-11-06T10:00:00Z',
        },
      ]),
    ).toBe('primary');
  });
});
