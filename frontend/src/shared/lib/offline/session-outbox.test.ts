import { QueryClient, onlineManager } from '@tanstack/react-query';
import { clear as clearIdb } from 'idb-keyval';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { persistStorage } from '@/shared/lib/platform/storage/query-cache';
import { FAILED_MUTATIONS_STORE_KEY } from './failed-mutations';
import { PHOTO_QUEUE_STORE_KEY, resetPhotoQueueMigrationForTests } from './photo-queue';
import { preserveOwnerOutbox, restoreOwnerOutbox } from './session-outbox';

beforeEach(async () => {
  await clearIdb();
  resetPhotoQueueMigrationForTests();
  onlineManager.setOnline(false);
});

afterEach(() => {
  onlineManager.setOnline(true);
});

it('restores unsent mutations only for their owner after the shared cache is wiped', async () => {
  const source = new QueryClient();
  const pending = source.getMutationCache().build(source, {
    mutationKey: ['save-measurement'],
    mutationFn: async () => 'saved',
  });
  void pending.execute({ id: 'owner-measurement', weight: 68 });
  await Promise.resolve();

  await preserveOwnerOutbox(source, 'owner');
  source.clear();
  await persistStorage.removeItem('dopafit-query-cache');

  const stranger = new QueryClient();
  await restoreOwnerOutbox(stranger, 'stranger', () => true);
  expect(stranger.getMutationCache().getAll()).toHaveLength(0);

  const owner = new QueryClient();
  await restoreOwnerOutbox(owner, 'owner', () => true);
  expect(owner.getMutationCache().getAll()).toHaveLength(1);
  expect(owner.getMutationCache().getAll()[0].state.variables).toEqual({
    id: 'owner-measurement',
    weight: 68,
  });
  expect(await persistStorage.getItem('dopafit-owner-outbox:owner')).toBeUndefined();
  expect(await persistStorage.getItem('dopafit-query-cache')).toContain('owner-measurement');
});

it('keeps failed actions and queued photos private until the owner returns', async () => {
  const failed = JSON.stringify([
    { id: 'failed-1', key: ['save'], variables: { id: 'private' }, label: 'Замер', failedAt: '' },
  ]);
  const photos = JSON.stringify([
    {
      id: 'photo-1',
      measurementClientId: 'private',
      kind: 'front',
      contentType: 'image/png',
      base64: 'aGVsbG8=',
    },
  ]);
  await persistStorage.setItem(FAILED_MUTATIONS_STORE_KEY, failed);
  await persistStorage.setItem(PHOTO_QUEUE_STORE_KEY, photos);
  await preserveOwnerOutbox(new QueryClient(), 'owner');
  await persistStorage.removeItem(FAILED_MUTATIONS_STORE_KEY);
  await persistStorage.removeItem(PHOTO_QUEUE_STORE_KEY);

  await restoreOwnerOutbox(new QueryClient(), 'stranger', () => true);
  expect(await persistStorage.getItem(FAILED_MUTATIONS_STORE_KEY)).toBeUndefined();
  expect(await persistStorage.getItem(PHOTO_QUEUE_STORE_KEY)).toBeUndefined();

  await restoreOwnerOutbox(new QueryClient(), 'owner', () => true);
  expect(await persistStorage.getItem(FAILED_MUTATIONS_STORE_KEY)).toBe(failed);
  expect(await persistStorage.getItem(PHOTO_QUEUE_STORE_KEY)).toBe(photos);
});
