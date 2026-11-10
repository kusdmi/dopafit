import { MutationObserver, QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearFailedMutations,
  enqueueFailedMutation,
  isRetriableFailure,
  listFailedMutations,
  persistFailedMutation,
  removeFailedMutation,
  setFailedMutationAuthGate,
} from './failed-mutations';
import { SAVE_MEASUREMENT_KEY, SYNC_WORKOUT_KEY } from './mutationKeys';
import { registerWorkoutMutationDefaults } from './setupOffline';

async function runViaDefaults(
  qc: QueryClient,
  mutationKey: readonly unknown[],
  variables: unknown,
): Promise<void> {
  const observer = new MutationObserver<unknown, unknown, unknown>(qc, {
    mutationKey: [...mutationKey],
  });
  // The mutation is expected to reject after retries; swallow so the test focuses
  // on the side effect (payload persisted to the failed outbox).
  await observer.mutate(variables).catch(() => {});
}

beforeEach(async () => {
  await clearFailedMutations();
  setFailedMutationAuthGate(() => true);
});
afterEach(async () => {
  await clearFailedMutations();
  setFailedMutationAuthGate(() => true);
});

describe('failed-mutations store', () => {
  it('enqueues, lists and removes a failed mutation', async () => {
    await enqueueFailedMutation({
      key: SYNC_WORKOUT_KEY,
      variables: { sets: [1] },
      label: 'Тренировка',
    });
    const items = await listFailedMutations();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ label: 'Тренировка', variables: { sets: [1] } });

    await removeFailedMutation(items[0].id);
    expect(await listFailedMutations()).toEqual([]);
  });

  it('deduplicates the same (key, variables) payload', async () => {
    const payload = { key: SYNC_WORKOUT_KEY, variables: { a: 1 }, label: 'Тренировка' };
    await enqueueFailedMutation(payload);
    await enqueueFailedMutation(payload);
    expect(await listFailedMutations()).toHaveLength(1);
  });
});

describe('retriability gate (MAJOR-2b)', () => {
  it('does NOT enqueue a non-retriable 4xx (validation_error)', () => {
    expect(isRetriableFailure({ code: 'validation_error' })).toBe(false);
    persistFailedMutation(SAVE_MEASUREMENT_KEY, { a: 1 }, 'Замер', {
      code: 'validation_error',
      message: 'bad',
    });
    // Synchronous check is enough: persist bails before touching storage.
    return expect(listFailedMutations()).resolves.toEqual([]);
  });

  it.each(['forbidden', 'not_found', 'conflict', 'bad_request', 'measurement_date_conflict'])(
    'treats %s as non-retriable',
    (code) => {
      expect(isRetriableFailure({ code })).toBe(false);
    },
  );

  it('DOES enqueue a server / network failure (500 / no recognised code)', async () => {
    // 5xx surfaces as network_error via toApiError; a bare Error has no code.
    expect(isRetriableFailure({ code: 'network_error' })).toBe(true);
    expect(isRetriableFailure(new Error('boom'))).toBe(true);
    persistFailedMutation(SYNC_WORKOUT_KEY, { s: 1 }, 'Тренировка', new Error('boom'));
    const items = await vi.waitFor(async () => {
      const current = await listFailedMutations();
      expect(current).toHaveLength(1);
      return current;
    });
    expect(items[0].label).toBe('Тренировка');
  });

  it('keeps 401 / 429 retriable (they recover after refresh / cooldown)', () => {
    expect(isRetriableFailure({ code: 'unauthorized' })).toBe(true);
    expect(isRetriableFailure({ code: 'rate_limited' })).toBe(true);
  });
});

describe('auth gate (MAJOR-3)', () => {
  it('does not persist while signed out, even if the mutation errors late', async () => {
    setFailedMutationAuthGate(() => false);
    await enqueueFailedMutation({ key: SYNC_WORKOUT_KEY, variables: { s: 1 }, label: 'Тренировка' });
    persistFailedMutation(SYNC_WORKOUT_KEY, { s: 2 }, 'Тренировка', new Error('late'));
    // Give the fire-and-forget path a tick; store must stay empty.
    await Promise.resolve();
    expect(await listFailedMutations()).toEqual([]);
  });

  it('persists again once signed back in', async () => {
    setFailedMutationAuthGate(() => false);
    await enqueueFailedMutation({ key: SYNC_WORKOUT_KEY, variables: { s: 1 }, label: 'Тренировка' });
    expect(await listFailedMutations()).toEqual([]);
    setFailedMutationAuthGate(() => true);
    await enqueueFailedMutation({ key: SYNC_WORKOUT_KEY, variables: { s: 1 }, label: 'Тренировка' });
    expect(await listFailedMutations()).toHaveLength(1);
  });
});

describe('workout sync defaults onError persistence', () => {
  it('persists the payload to the failed outbox after the sync mutation errors', async () => {
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: 0 } } });
    // Register with a fn that always rejects, then override retry via the default
    // already set (retry: 3) — force fast failure by mocking the fn to reject.
    const sync = vi.fn().mockRejectedValue(new Error('network flap'));
    registerWorkoutMutationDefaults(qc, sync);
    // Shrink retries so the test doesn't wait for 3 backoff cycles.
    qc.setMutationDefaults([...SYNC_WORKOUT_KEY], {
      ...qc.getMutationDefaults([...SYNC_WORKOUT_KEY]),
      retry: 0,
    });

    await runViaDefaults(qc, SYNC_WORKOUT_KEY, { sessionId: 's1', sets: [{ weight: 105 }] });

    expect(sync).toHaveBeenCalled();
    // onError persists fire-and-forget (must not block the mutation lifecycle), so
    // let the enqueue's microtasks + idb write settle before asserting.
    const items = await vi.waitFor(async () => {
      const current = await listFailedMutations();
      expect(current).toHaveLength(1);
      return current;
    });
    expect(items[0].label).toBe('Тренировка');
    expect(items[0].variables).toEqual({ sessionId: 's1', sets: [{ weight: 105 }] });
  });
});
