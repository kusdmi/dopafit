import { dehydrate, hydrate, onlineManager, QueryClient } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';

import {
  SAVE_MEASUREMENT_KEY,
  SAVE_PROGRAM_KEY,
  SYNC_WORKOUT_KEY,
} from '@/shared/lib/offline/mutationKeys';
import { trackMetrikaGoal } from './metrika';
import { bindMetrikaMutations } from './mutation-goals';

vi.mock('./metrika', () => ({ trackMetrikaGoal: vi.fn() }));
afterEach(() => {
  vi.clearAllMocks();
  onlineManager.setOnline(true);
});

it('counts confirmed saves only and does not forward bodies, identifiers or measurement values', async () => {
  const client = new QueryClient();
  const stop = bindMetrikaMutations(client, () => true);
  const execute = (key: readonly string[], variables: unknown, success = true) =>
    client
      .getMutationCache()
      .build(client, {
        mutationKey: key,
        mutationFn: async () => {
          if (!success) throw new Error('validation');
          return {};
        },
      })
      .execute(variables);
  await execute(SAVE_PROGRAM_KEY, { body: { name: 'private' } }, false).catch(() => {});
  await execute(SAVE_PROGRAM_KEY, { programId: 'private', body: { name: 'private' } });
  expect(trackMetrikaGoal).not.toHaveBeenCalled();
  await execute(SAVE_PROGRAM_KEY, { body: { name: 'private' } });
  await execute(SAVE_MEASUREMENT_KEY, { weight: 77, id: 'private' });
  await execute(SYNC_WORKOUT_KEY, { client_id: 'private', sets: [{ weight: 45 }] });
  expect(vi.mocked(trackMetrikaGoal).mock.calls).toEqual([
    ['program_created'],
    ['measurement_saved'],
    ['workout_completed', { participant: 'client' }],
  ]);
  stop();
  await execute(SAVE_MEASUREMENT_KEY, { weight: 77 });
  expect(trackMetrikaGoal).toHaveBeenCalledTimes(3);
  client.clear();
});

it('counts a restored offline mutation once after retries succeed, and ignores work after logout', async () => {
  const original = new QueryClient();
  onlineManager.setOnline(false);
  const pending = original.getMutationCache().build(original, {
    mutationKey: SAVE_PROGRAM_KEY,
    mutationFn: async () => ({}),
  });
  const execution = pending.execute({ body: { id: 'private', name: 'private' } });
  const snapshot = dehydrate(original);
  const restored = new QueryClient();
  let authenticated = true;
  const stop = bindMetrikaMutations(restored, () => authenticated);
  const save = vi.fn().mockRejectedValueOnce(new Error('temporary')).mockResolvedValue({});
  restored.setMutationDefaults(SAVE_PROGRAM_KEY, { mutationFn: save, retry: 1, retryDelay: 0 });
  hydrate(restored, snapshot);
  expect(trackMetrikaGoal).not.toHaveBeenCalled();
  onlineManager.setOnline(true);
  await restored.resumePausedMutations();
  expect(save).toHaveBeenCalledTimes(2);
  expect(trackMetrikaGoal).toHaveBeenCalledExactlyOnceWith('program_created');
  authenticated = false;
  await restored
    .getMutationCache()
    .build(restored, {
      mutationKey: SAVE_MEASUREMENT_KEY,
      mutationFn: async () => ({}),
    })
    .execute({ id: 'private' });
  expect(trackMetrikaGoal).toHaveBeenCalledTimes(1);
  stop();
  await original.resumePausedMutations();
  await execution;
  original.clear();
  restored.clear();
});
