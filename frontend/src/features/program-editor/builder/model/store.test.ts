import { beforeEach, describe, expect, it } from 'vitest';

import { useBuilderStore } from './store';

const ex = { exercise_id: null, custom_name: 'X', name: 'X', sets: 3, reps: 10 };

describe('builder store', () => {
  beforeEach(() => useBuilderStore.getState().initEmpty());

  it('caps alternatives at five plus the primary', () => {
    const s = useBuilderStore.getState();
    s.addDay('День 1');
    const dayId = useBuilderStore.getState().draft.days[0].id;
    useBuilderStore.getState().addExercise(dayId, ex);
    const slotId = useBuilderStore.getState().draft.days[0].slots[0].id;
    for (let i = 0; i < 7; i++) useBuilderStore.getState().addAlternative(dayId, slotId, ex);
    expect(useBuilderStore.getState().draft.days[0].slots[0].exercises).toHaveLength(6);
  });

  it('caps days at 7', () => {
    for (let i = 0; i < 12; i += 1) useBuilderStore.getState().addDay(`День ${i}`);
    expect(useBuilderStore.getState().draft.days).toHaveLength(7);
  });

  it('updates one variant while preserving its id and neighboring alternatives', () => {
    const state = useBuilderStore.getState();
    state.addDay('День 1');
    const dayId = useBuilderStore.getState().draft.days[0].id;
    state.addExercise(dayId, ex);
    const slotId = useBuilderStore.getState().draft.days[0].slots[0].id;
    state.addAlternative(dayId, slotId, { ...ex, name: 'Y', custom_name: 'Y' });
    const before = useBuilderStore.getState().draft.days[0].slots[0].exercises;

    state.updateSlotExercise(dayId, slotId, before[0].id, { sets: 6, reps: 11 });

    const after = useBuilderStore.getState().draft.days[0].slots[0].exercises;
    expect(after[0]).toMatchObject({ id: before[0].id, sets: 6, reps: 11 });
    expect(after[1]).toEqual(before[1]);
  });

  it('moves a slot between days', () => {
    const s = useBuilderStore.getState();
    s.addDay('A');
    s.addDay('B');
    const [a, b] = useBuilderStore.getState().draft.days;
    useBuilderStore.getState().addExercise(a.id, ex);
    useBuilderStore.getState().moveSlot(a.id, b.id, 0, 0);
    const days = useBuilderStore.getState().draft.days;
    expect(days[0].slots).toHaveLength(0);
    expect(days[1].slots).toHaveLength(1);
  });

  it('removes an alternative and re-numbers variant_order', () => {
    const s = useBuilderStore.getState();
    s.addDay('День 1');
    const dayId = useBuilderStore.getState().draft.days[0].id;
    useBuilderStore.getState().addExercise(dayId, ex);
    const slotId = useBuilderStore.getState().draft.days[0].slots[0].id;
    useBuilderStore.getState().addAlternative(dayId, slotId, ex);
    useBuilderStore.getState().addAlternative(dayId, slotId, ex);
    // now 3 exercises with variant_order [0, 1, 2]
    const middleId = useBuilderStore.getState().draft.days[0].slots[0].exercises[1].id;
    useBuilderStore.getState().removeSlotExercise(dayId, slotId, middleId);
    const exercises = useBuilderStore.getState().draft.days[0].slots[0].exercises;
    expect(exercises).toHaveLength(2);
    expect(exercises.map((e) => e.variant_order)).toEqual([0, 1]);
  });

  it('drops the slot when its last exercise is removed', () => {
    const s = useBuilderStore.getState();
    s.addDay('День 1');
    const dayId = useBuilderStore.getState().draft.days[0].id;
    useBuilderStore.getState().addExercise(dayId, ex);
    const slotId = useBuilderStore.getState().draft.days[0].slots[0].id;
    const exId = useBuilderStore.getState().draft.days[0].slots[0].exercises[0].id;
    useBuilderStore.getState().removeSlotExercise(dayId, slotId, exId);
    expect(useBuilderStore.getState().draft.days[0].slots).toHaveLength(0);
  });
});
