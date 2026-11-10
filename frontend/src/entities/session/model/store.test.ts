import { beforeEach, describe, expect, it } from 'vitest';
import { clear as idbClear } from 'idb-keyval';

import { useSessionStore } from './store';
import { useWorkoutStore } from '@/entities/workout/model/store';
import { tokenStorage } from '@/shared/api/tokens';

const AUTH = {
  user: { id: 'u1', email: 'a@b.c' },
  tokens: { access_token: 'acc', refresh_token: 'ref', token_type: 'bearer' },
} as never;

describe('useSessionStore', () => {
  beforeEach(async () => {
    await idbClear();
    await useSessionStore.getState().clearSession();
  });

  it('setSession stores tokens in secure storage and user in state', async () => {
    await useSessionStore.getState().setSession(AUTH);
    expect(useSessionStore.getState().user).toEqual({ id: 'u1', email: 'a@b.c' });
    expect(useSessionStore.getState().isAuthenticated).toBe(true);
    expect(await tokenStorage.getAccess()).toBe('acc');
  });

  it('clearSession clears tokens and user', async () => {
    await useSessionStore.getState().setSession(AUTH);
    await useSessionStore.getState().clearSession();
    expect(useSessionStore.getState().user).toBeNull();
    expect(useSessionStore.getState().isAuthenticated).toBe(false);
    expect(await tokenStorage.getAccess()).toBeNull();
  });

  it('clearSession resets the workout store (cross-platform cleanup)', async () => {
    useWorkoutStore.getState().startSession({
      participant: { kind: 'self' },
      programId: 'p1',
      dayId: 'd1',
      slots: [{ slotId: 'sl1', variantId: 'v1', name: 'Жим', sets: 3, reps: 10, alternatives: [] }],
    });
    expect(Object.keys(useWorkoutStore.getState().sessions).length).toBe(1);
    await useSessionStore.getState().clearSession();
    expect(Object.keys(useWorkoutStore.getState().sessions).length).toBe(0);
    expect(useWorkoutStore.getState().activeKey).toBeNull();
  });
});
