import { describe, expect, it, beforeEach } from 'vitest';

import { useWorkoutStore } from './store';
import type { Participant } from './types';

function start(p: Participant) {
  useWorkoutStore.getState().startSession({
    participant: p,
    programId: 'p1',
    dayId: 'd1',
    slots: [{ slotId: 'sl1', variantId: 'v1', name: 'Жим', sets: 3, reps: 10, alternatives: [] }],
  });
}

describe('parallel finish snapshots', () => {
  beforeEach(() => useWorkoutStore.getState().reset());

  it('produces independent snapshots carrying each client id', () => {
    start({ kind: 'client', clientId: 'a', clientName: 'Аня' });
    start({ kind: 'client', clientId: 'b', clientName: 'Боря' });
    const snapA = useWorkoutStore.getState().finishSession('client:a');
    const snapB = useWorkoutStore.getState().finishSession('client:b');
    expect(snapA?.participant).toEqual({ kind: 'client', clientId: 'a', clientName: 'Аня' });
    expect(snapB?.participant).toEqual({ kind: 'client', clientId: 'b', clientName: 'Боря' });
    expect(snapA?.sessionId).not.toBe(snapB?.sessionId);
    expect(useWorkoutStore.getState().sessions).toEqual({});
  });
});
