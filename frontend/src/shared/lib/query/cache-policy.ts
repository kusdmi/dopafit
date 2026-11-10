import type { DehydratedState, QueryClient } from '@tanstack/react-query';
import { boundExerciseSnapshot, EXERCISE_PAGE_CACHE_LIMIT } from './exercise-cache';

export const QUERY_GC_TIME = 5 * 60_000;
export const QUERY_CACHE_LIMIT = 80;
// Approximate UTF-16 payload size; active screens and pending writes are exempt.
export const QUERY_CACHE_BYTES = 8 * 1024 * 1024;
const sizes = new WeakMap<object, number>();

function payloadSize(data: unknown): number {
  if (data === undefined) return 0;
  if (data !== null && typeof data === 'object') {
    const cached = sizes.get(data);
    if (cached !== undefined) return cached;
    const size = JSON.stringify(data).length * 2;
    sizes.set(data, size);
    return size;
  }
  return JSON.stringify(data).length * 2;
}

function pendingIds(variables: unknown, ids = new Set<string>()): Set<string> {
  if (!variables || typeof variables !== 'object') return ids;
  for (const [key, value] of Object.entries(variables)) {
    if (typeof value === 'string' && /(^id$|_id$|Id$)/.test(key)) ids.add(value);
    else if (value && typeof value === 'object') pendingIds(value, ids);
  }
  return ids;
}

function isProtected(key: readonly unknown[], ids: Set<string>) {
  // Offline optimistic lists are the local source of truth until delivery.
  if (key[0] === 'measurements' && key[1] === 'list') return true;
  if (key[0] === 'programs' && key[1] === 'list') return true;
  return key.some((part) => typeof part === 'string' && ids.has(part));
}

/** Apply the same limits on write AND restore, including pre-upgrade snapshots. */
export function boundQuerySnapshot(state: DehydratedState): DehydratedState {
  const ids = new Set<string>();
  for (const mutation of state.mutations) pendingIds(mutation.state.variables, ids);
  const protectedQueries = state.queries.filter((query) => isProtected(query.queryKey, ids));
  let bytes = protectedQueries.reduce((sum, query) => sum + payloadSize(query.state.data), 0);
  let count = protectedQueries.length;
  const candidates = boundExerciseSnapshot(
    state.queries.filter((query) => !isProtected(query.queryKey, ids)),
  ).sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt);
  const queries = [
    ...protectedQueries,
    ...candidates.filter((query) => {
      const size = payloadSize(query.state.data);
      if (count >= QUERY_CACHE_LIMIT || bytes + size > QUERY_CACHE_BYTES) return false;
      bytes += size;
      count++;
      return true;
    }),
  ];
  return { ...state, queries };
}

const bindings = new WeakMap<QueryClient, { users: number; unsubscribe: () => void }>();

/** LRU eviction across the whole application, without evicting mounted screens. */
export function bindQueryCache(client: QueryClient): () => void {
  let binding = bindings.get(client);
  if (!binding) {
    let clock = 0;
    let scheduled = false;
    let disposed = false;
    const used = new WeakMap<object, number>();
    const inactiveSince = new WeakMap<object, number>();
    const trim = () => {
      scheduled = false;
      if (disposed) return;
      const ids = new Set<string>();
      for (const mutation of client.getMutationCache().getAll()) {
        if (mutation.state.status === 'pending') pendingIds(mutation.state.variables, ids);
      }
      const queries = client.getQueryCache().getAll();
      for (const query of queries) {
        if (!used.has(query)) used.set(query, ++clock);
        if (!inactiveSince.has(query)) inactiveSince.set(query, Date.now());
      }
      let count = queries.length;
      let bytes = queries.reduce((sum, query) => sum + payloadSize(query.state.data), 0);
      let pages = queries.filter(
        (query) => query.queryKey[0] === 'exercises' && query.queryKey[1] === 'list',
      ).length;
      let details = queries.filter(
        (query) => query.queryKey[0] === 'exercises' && query.queryKey[1] === 'detail',
      ).length;
      const inactive = queries
        .filter(
          (query) => query.getObserversCount() === 0 && query.state.fetchStatus !== 'fetching',
        )
        .sort((a, b) => (used.get(a) ?? 0) - (used.get(b) ?? 0));
      for (const query of inactive) {
        const page = query.queryKey[0] === 'exercises' && query.queryKey[1] === 'list';
        const detail = query.queryKey[0] === 'exercises' && query.queryKey[1] === 'detail';
        if (isProtected(query.queryKey, ids)) continue;
        const expired = Date.now() - (inactiveSince.get(query) ?? Date.now()) >= QUERY_GC_TIME;
        if (
          !expired &&
          count <= QUERY_CACHE_LIMIT &&
          bytes <= QUERY_CACHE_BYTES &&
          !(page && pages > EXERCISE_PAGE_CACHE_LIMIT) &&
          !(detail && details > 10)
        )
          continue;
        count--;
        bytes -= payloadSize(query.state.data);
        if (page) pages--;
        if (detail) details--;
        client.getQueryCache().remove(query);
      }
    };
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      // Observers attach after render: never evict the new page mid-switch.
      queueMicrotask(trim);
    };
    const unsubscribeQuery = client.getQueryCache().subscribe((event) => {
      if (
        event.type === 'observerAdded' ||
        (event.type === 'updated' && event.action.type === 'success')
      )
        used.set(event.query, ++clock);
      if (event.type === 'observerRemoved' || event.type === 'observerAdded')
        inactiveSince.set(event.query, Date.now());
      if (event.type !== 'removed') schedule();
    });
    const unsubscribeMutation = client.getMutationCache().subscribe(schedule);
    const timer = setInterval(schedule, 60_000);
    binding = {
      users: 0,
      unsubscribe: () => {
        disposed = true;
        clearInterval(timer);
        unsubscribeQuery();
        unsubscribeMutation();
      },
    };
    bindings.set(client, binding);
    schedule();
  }
  binding.users++;
  return () => {
    if (--binding.users === 0) {
      binding.unsubscribe();
      bindings.delete(client);
    }
  };
}
