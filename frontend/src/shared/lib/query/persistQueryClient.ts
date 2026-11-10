import { dehydrate, type Mutation, type QueryClient } from '@tanstack/react-query';
import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client';
import { del } from 'idb-keyval';
import { boundQuerySnapshot } from './cache-policy';

import { persistStorage } from '@/shared/lib/platform/storage/query-cache';
import { clearStorageError, reportStorageError } from '@/shared/lib/platform/storage/errors';

const CACHE_KEY = 'dopafit-query-cache';
// Cached server data older than this is dropped on restore.
export const PERSIST_MAX_AGE = 1000 * 60 * 60 * 24;

let writes: Promise<unknown> = Promise.resolve();
let generation = 0;
let restorationFailed = false;
let backgroundSnapshot: PersistedClient | undefined;
let backgroundWriter: Promise<void> | undefined;

/**
 * A snapshot dropped on purpose rather than a storage failure. Logging out while a
 * background write is queued is routine, and the outgoing user's data must not be
 * written back — but nothing was lost, so the user must not be warned about it.
 */
class StaleSnapshotError extends Error {}

function writeClient(client: PersistedClient): Promise<void> {
  const capturedGeneration = generation;
  // Serialize now: subsequent optimistic updates cannot mutate the queued snapshot.
  const serialized = JSON.stringify({
    ...client,
    clientState: boundQuerySnapshot(client.clientState),
  });
  const pending = writes
    .catch(() => {})
    .then(async () => {
      if (capturedGeneration !== generation)
        throw new StaleSnapshotError('Session changed during local save');
      if (restorationFailed) throw new Error('Existing outbox could not be restored');
      await persistStorage.setItem(CACHE_KEY, serialized);
    });
  writes = pending;
  return pending;
}

export const queryPersister: Persister = {
  persistClient(client) {
    // Keep at most the in-flight write and the latest background snapshot.
    // A slow disk must not queue hundreds of serialized copies of the cache.
    backgroundSnapshot = client;
    if (!backgroundWriter) {
      backgroundWriter = (async () => {
        while (backgroundSnapshot) {
          const snapshot = backgroundSnapshot;
          backgroundSnapshot = undefined;
          try {
            await writeClient(snapshot);
          } catch (error) {
            if (!(error instanceof StaleSnapshotError)) reportStorageError();
          }
        }
      })().finally(() => {
        backgroundWriter = undefined;
        if (backgroundSnapshot) void queryPersister.persistClient(backgroundSnapshot);
      });
    }
    return backgroundWriter;
  },
  async restoreClient() {
    try {
      while (backgroundWriter) await backgroundWriter;
      await writes.catch(() => {});
      const raw = await persistStorage.getItem(CACHE_KEY);
      if (!raw) return undefined;
      const client = JSON.parse(raw) as PersistedClient;
      if (
        !client.clientState ||
        !Array.isArray(client.clientState.mutations) ||
        !Array.isArray(client.clientState.queries)
      )
        throw new Error('Invalid persisted state');
      restorationFailed = false;
      if (Date.now() - client.timestamp > PERSIST_MAX_AGE) {
        // Server data expires independently of user writes awaiting delivery.
        return {
          ...client,
          timestamp: Date.now(),
          clientState: { ...client.clientState, queries: [] },
        };
      }
      return {
        ...client,
        clientState: boundQuerySnapshot(client.clientState),
      };
    } catch {
      // Avoid the provider's catch-and-remove behavior on storage read failure.
      // Block later background writes so an unreadable outbox is not overwritten.
      restorationFailed = true;
      reportStorageError();
      return undefined;
    }
  },
  async removeClient() {
    generation += 1;
    backgroundSnapshot = undefined;
    const pending = writes.catch(() => {}).then(() => persistStorage.removeItem(CACHE_KEY));
    writes = pending;
    await pending;
    restorationFailed = false;
  },
};

/** Resolve only after the offline payload is durably committed to the platform store. */
export async function persistOfflineState(queryClient: QueryClient): Promise<void> {
  // This durable snapshot supersedes background snapshots captured before it.
  backgroundSnapshot = undefined;
  try {
    await writeClient({
      timestamp: Date.now(),
      buster: '',
      clientState: dehydrate(queryClient, {
        shouldDehydrateQuery: (query) =>
          query.state.status === 'success' && shouldPersistQuery(query.queryKey),
        shouldDehydrateMutation,
      }),
    });
    clearStorageError();
  } catch (error) {
    reportStorageError();
    throw error;
  }
}

/**
 * Only successful, non-sensitive queries are written to disk. User profile/settings
 * ('users' key) are kept in memory only so they never persist past logout.
 */
export function shouldPersistQuery(queryKey: readonly unknown[]): boolean {
  if (queryKey[0] === 'users') return false;
  if (queryKey[0] === 'measurements' && queryKey[1] === 'client') return false;
  if (
    queryKey[0] === 'analytics' &&
    queryKey.some((part) => part && typeof part === 'object' && 'clientId' in part && part.clientId)
  )
    return false;
  return true;
}

export async function clearPersistedQueryCache(): Promise<void> {
  try {
    // The persister writes the cache (queries + paused-mutation outbox) through
    // `persistStorage`, which is SQLite on native. Clearing it must go through the
    // SAME adapter — a raw idb-keyval `del(CACHE_KEY)` is a no-op on native, so the
    // previous user's cache/outbox would survive logout and leak into (or replay
    // under) the next account. removeClient() removes exactly the persister's key.
    await queryPersister.removeClient();
    // Legacy web-only keys still stored via idb-keyval. On native these live in
    // Capacitor Preferences / Keychain and are torn down elsewhere, so `del` here
    // is a harmless best-effort no-op.
    await del('dopafit.session');
    await del('dopafit.workout');
    await del('dopafit.access_token');
    await del('dopafit.refresh_token');
  } catch (error) {
    reportStorageError();
    throw error;
  }
}

/** Persist only paused (queued offline) mutations, so the outbox survives reloads. */
export function shouldDehydrateMutation(
  mutation: Mutation<unknown, Error, unknown, unknown>,
): boolean {
  return mutation.state.isPaused;
}
