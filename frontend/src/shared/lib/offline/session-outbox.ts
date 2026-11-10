import { dehydrate, hydrate, type QueryClient } from '@tanstack/react-query';

import { persistStorage } from '@/shared/lib/platform/storage/query-cache';
import { persistOfflineState, shouldDehydrateMutation } from '@/shared/lib/query/persistQueryClient';
import {
  FAILED_MUTATIONS_STORE_KEY,
  restoreFailedMutations,
} from './failed-mutations';
import { listPendingPhotos, PHOTO_QUEUE_STORE_KEY } from './photo-queue';

const OWNER_OUTBOX_PREFIX = 'dopafit-owner-outbox:';

interface OwnerOutbox {
  mutations: ReturnType<typeof dehydrate>['mutations'];
  failed: string | null;
  photos: string | null;
}

function keyFor(userId: string): string {
  return `${OWNER_OUTBOX_PREFIX}${userId}`;
}

function storedRows(raw: string | null): unknown[] {
  if (!raw) return [];
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value)) throw new Error('Invalid stored outbox');
  return value;
}

function mergeRows(previous: string | null, current: string | null): string | null {
  const rows = [...storedRows(previous), ...storedRows(current)];
  if (rows.length === 0) return null;
  const byId = new Map<string, unknown>();
  for (const row of rows) {
    const id = typeof row === 'object' && row !== null && 'id' in row ? String(row.id) : JSON.stringify(row);
    byId.set(id, row);
  }
  return JSON.stringify([...byId.values()]);
}

function readSnapshot(raw: string | null): OwnerOutbox {
  if (!raw) return { mutations: [], failed: null, photos: null };
  const value = JSON.parse(raw) as OwnerOutbox;
  if (!value || !Array.isArray(value.mutations)) throw new Error('Invalid owner outbox');
  return value;
}

/** Archive only unsent work before logout wipes shared in-memory and disk caches. */
export async function preserveOwnerOutbox(queryClient: QueryClient, userId: string): Promise<void> {
  // Migrate any legacy web photo queue before copying the platform-backed value.
  await listPendingPhotos();
  const previous = readSnapshot((await persistStorage.getItem(keyFor(userId))) ?? null);
  const current = dehydrate(queryClient, {
    shouldDehydrateQuery: () => false,
    shouldDehydrateMutation,
  }).mutations;
  const mutations = new Map<string, (typeof current)[number]>();
  for (const item of [...previous.mutations, ...current]) {
    mutations.set(JSON.stringify([item.mutationKey, item.state.variables]), item);
  }
  const snapshot: OwnerOutbox = {
    mutations: [...mutations.values()],
    failed: mergeRows(previous.failed, (await persistStorage.getItem(FAILED_MUTATIONS_STORE_KEY)) ?? null),
    photos: mergeRows(previous.photos, (await persistStorage.getItem(PHOTO_QUEUE_STORE_KEY)) ?? null),
  };
  if (snapshot.mutations.length || snapshot.failed || snapshot.photos) {
    await persistStorage.setItem(keyFor(userId), JSON.stringify(snapshot));
  }
}

/** Restore only the account that owned the work; make it durable before replay. */
export async function restoreOwnerOutbox(
  queryClient: QueryClient,
  userId: string,
  isCurrentOwner: () => boolean,
): Promise<void> {
  const raw = await persistStorage.getItem(keyFor(userId));
  if (!raw || !isCurrentOwner()) return;
  const snapshot = readSnapshot(raw);
  if (snapshot.failed) await restoreFailedMutations(snapshot.failed);
  if (!isCurrentOwner()) return;
  if (snapshot.photos) await persistStorage.setItem(PHOTO_QUEUE_STORE_KEY, snapshot.photos);
  if (!isCurrentOwner()) return;
  if (snapshot.mutations.length > 0) {
    hydrate(queryClient, { mutations: snapshot.mutations, queries: [] });
    await persistOfflineState(queryClient);
  }
  if (!isCurrentOwner()) return;
  await persistStorage.removeItem(keyFor(userId));
  await queryClient.resumePausedMutations();
}
