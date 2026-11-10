import { beforeEach, describe, expect, it } from 'vitest';

import { useWorkoutStore } from './store';
import type { Participant } from './types';

const SELF: Participant = { kind: 'self' };
const CLIENT_A: Participant = { kind: 'client', clientId: 'a', clientName: 'Аня' };
const CLIENT_B: Participant = { kind: 'client', clientId: 'b', clientName: 'Боря' };

function start(participant: Participant) {
  useWorkoutStore.getState().startSession({
    participant,
    programId: 'p1',
    dayId: 'd1',
    slots: [{ slotId: 'sl1', variantId: 'v1', name: 'Жим', sets: 3, reps: 10, alternatives: [] }],
  });
}

describe('useWorkoutStore (multi-session)', () => {
  beforeEach(() => useWorkoutStore.getState().reset());

  it('starts a session under the self key and makes it active', () => {
    start(SELF);
    const st = useWorkoutStore.getState();
    expect(Object.keys(st.sessions)).toEqual(['self']);
    expect(st.activeKey).toBe('self');
    expect(st.sessions.self.sessionId).toBeTruthy();
  });

  it('keys client sessions by client id and holds several in parallel', () => {
    start(CLIENT_A);
    start(CLIENT_B);
    const st = useWorkoutStore.getState();
    expect(Object.keys(st.sessions).sort()).toEqual(['client:a', 'client:b']);
    expect(st.activeKey).toBe('client:b');
  });

  it('re-starting for the same client returns the existing session (no data loss)', () => {
    start(CLIENT_A);
    useWorkoutStore.getState().addSet({ slotId: 'sl1', variantId: 'v1', weight: 50, reps: 10 });
    start(CLIENT_A);
    const st = useWorkoutStore.getState();
    expect(Object.keys(st.sessions)).toEqual(['client:a']);
    expect(st.sessions['client:a'].sets).toHaveLength(1);
  });

  it('adds/edits/deletes sets on the active session only', () => {
    start(CLIENT_A);
    start(CLIENT_B);
    useWorkoutStore.getState().addSet({ slotId: 'sl1', variantId: 'v1', weight: 60, reps: 6 });
    const st = useWorkoutStore.getState();
    expect(st.sessions['client:b'].sets).toHaveLength(1);
    expect(st.sessions['client:a'].sets).toHaveLength(0);
  });

  it('switchTo changes the active session without losing the other', () => {
    start(CLIENT_A);
    useWorkoutStore.getState().addSet({ slotId: 'sl1', variantId: 'v1', weight: 40, reps: 12 });
    start(CLIENT_B);
    useWorkoutStore.getState().switchTo('client:a');
    const st = useWorkoutStore.getState();
    expect(st.activeKey).toBe('client:a');
    expect(st.sessions['client:a'].sets).toHaveLength(1);
    expect(st.sessions['client:b'].sets).toHaveLength(0);
  });

  it('toggles completion on the active session', () => {
    start(SELF);
    useWorkoutStore.getState().toggleComplete('sl1');
    expect(useWorkoutStore.getState().sessions.self.completed['sl1']).toBe(true);
  });

  function addSets(count: number) {
    for (let i = 0; i < count; i += 1) {
      useWorkoutStore.getState().addSet({ slotId: 'sl1', variantId: 'v1', weight: 50, reps: 10 });
    }
  }

  it('completes the exercise automatically once the planned sets are logged', () => {
    start(SELF);
    addSets(2); // план — 3 подхода
    expect(useWorkoutStore.getState().sessions.self.completed['sl1']).toBeUndefined();

    addSets(1);
    expect(useWorkoutStore.getState().sessions.self.completed['sl1']).toBe(true);
  });

  it('lets the automatic completion be taken back by hand', () => {
    start(SELF);
    addSets(3);
    useWorkoutStore.getState().toggleComplete('sl1');
    expect(useWorkoutStore.getState().sessions.self.completed['sl1']).toBe(false);
  });

  // Снятая отметка не должна возвращаться сама: условие «подходов хватает»
  // остаётся истинным, и без памяти о ручном решении снять её было бы нельзя.
  it('does not re-complete by itself after the mark was taken back', () => {
    start(SELF);
    addSets(3);
    useWorkoutStore.getState().toggleComplete('sl1');

    addSets(1);
    expect(useWorkoutStore.getState().sessions.self.completed['sl1']).toBe(false);
  });

  it('auto-completes only the exercise the set belongs to', () => {
    useWorkoutStore.getState().startSession({
      participant: SELF,
      programId: 'p1',
      dayId: 'd1',
      slots: [
        { slotId: 'sl1', variantId: 'v1', name: 'Жим', sets: 1, reps: 10, alternatives: [] },
        { slotId: 'sl2', variantId: 'v2', name: 'Тяга', sets: 1, reps: 10, alternatives: [] },
      ],
    });
    useWorkoutStore.getState().addSet({ slotId: 'sl1', variantId: 'v1', weight: 50, reps: 10 });

    const { completed } = useWorkoutStore.getState().sessions.self;
    expect(completed['sl1']).toBe(true);
    expect(completed['sl2']).toBeUndefined();
  });

  it('finishSession returns the snapshot, removes it, and activates a remaining session', () => {
    start(CLIENT_A);
    start(CLIENT_B);
    const snapshot = useWorkoutStore.getState().finishSession('client:b');
    expect(snapshot?.participant).toEqual(CLIENT_B);
    const st = useWorkoutStore.getState();
    expect(Object.keys(st.sessions)).toEqual(['client:a']);
    expect(st.activeKey).toBe('client:a');
  });

  it('finishing the last session clears activeKey', () => {
    start(SELF);
    useWorkoutStore.getState().finishSession('self');
    const st = useWorkoutStore.getState();
    expect(st.sessions).toEqual({});
    expect(st.activeKey).toBeNull();
  });

  it('each session keeps its own startedAt', () => {
    start(CLIENT_A);
    start(CLIENT_B);
    const st = useWorkoutStore.getState();
    expect(st.sessions['client:a'].startedAt).toBeTruthy();
    expect(st.sessions['client:b'].startedAt).toBeTruthy();
  });

  it('finishing the non-active session keeps activeKey on the still-active one', () => {
    start(CLIENT_A);
    start(CLIENT_B); // B is active
    useWorkoutStore.getState().switchTo('client:a'); // A is active
    useWorkoutStore.getState().finishSession('client:b'); // finish the non-active one
    const st = useWorkoutStore.getState();
    expect(st.activeKey).toBe('client:a');
    expect(Object.keys(st.sessions)).toEqual(['client:a']);
  });

  it('finishing the active session reassigns activeKey to a remaining session', () => {
    start(CLIENT_A);
    start(CLIENT_B); // B active
    useWorkoutStore.getState().finishSession('client:b'); // finish active
    const st = useWorkoutStore.getState();
    expect(st.activeKey).toBe('client:a');
  });
});
