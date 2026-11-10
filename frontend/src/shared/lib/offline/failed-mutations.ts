import { persistStorage } from '@/shared/lib/platform/storage/query-cache';
import { safeRandomUUID } from '@/shared/lib/uuid';

/**
 * A "failed outbox": offline mutations that exhausted their retries on replay and
 * would otherwise be dropped silently by TanStack. We persist the
 * mutation key + variables here (durable persistStorage — SQLite on native, idb on
 * web, same store the photo queue uses) so the user's action survives and can be
 * retried from the UI instead of vanishing.
 *
 * This is deliberately separate from the react-query mutation cache: a mutation
 * that reached `error` is no longer replayed by resumePausedMutations, so we own
 * its persistence and retry from here.
 */
const STORE_KEY = 'dopafit-failed-mutations';
export const FAILED_MUTATIONS_STORE_KEY = STORE_KEY;

export interface FailedMutation {
  id: string;
  /** The mutation key (SYNC_WORKOUT_KEY etc.) so retry re-selects the right fn. */
  key: readonly (string | number)[];
  /** The mutation variables — enough to re-run the exact same mutation. */
  variables: unknown;
  /** Human label for the UI list ("Тренировка", "Замер", ...). */
  label: string;
  /** ISO timestamp of the failure, for stable ordering. */
  failedAt: string;
}

type Listener = (items: FailedMutation[]) => void;
const listeners = new Set<Listener>();

/**
 * Auth gate for the outbox. Persisting a stranded payload only makes sense while a
 * user is signed in — otherwise a late `onError` (a mutation still retrying with
 * backoff while teardownOnUnauthorized already wiped the store) would write the
 * OUTGOING user's payload into a freshly cleared store, and the next account would
 * see a stranger's "Повторить" (MAJOR-3 / teardown↔late-onError race).
 *
 * The check must read LIVE auth state, not a closure captured when the mutation
 * started. It is injected from the app layer (App.tsx) so `shared` need not import
 * the session store from `entities` (FSD layering) — mirrors registerQueryClient.
 * Defaults to `() => true` so unit tests and non-app callers keep working.
 */
let isAuthenticatedGate: () => boolean = () => true;

export function setFailedMutationAuthGate(gate: () => boolean): void {
  isAuthenticatedGate = gate;
}

/**
 * Non-retriable backend error codes: a 4xx that will never succeed on a blind
 * replay (validation/permission/not-found/conflict). Persisting these into the
 * outbox just piles up entries the user can never clear and — for conflicts —
 * risks a duplicate once the real row already exists (MAJOR-2b). 401 (unauthorized)
 * and 429 (rate_limited) are intentionally absent: those DO become retriable once
 * the session refreshes / the limit window passes, as are 5xx and network errors
 * (which surface as `network_error` or without a recognised code). Keys mirror
 * backend/core/errors.py.
 */
const NON_RETRIABLE_ERROR_CODES = new Set([
  'bad_request',
  'forbidden',
  'not_found',
  'conflict',
  'measurement_date_conflict',
  'validation_error',
]);

/**
 * Whether a failed mutation is worth persisting for manual retry. Rejects the
 * non-retriable 4xx codes above; anything else (network / 5xx / 401 / 429 / an
 * unrecognised error) is kept so the user can retry once conditions recover.
 */
export function isRetriableFailure(error: unknown): boolean {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? (error as { code?: unknown }).code
      : undefined;
  return typeof code !== 'string' || !NON_RETRIABLE_ERROR_CODES.has(code);
}

async function readStored(): Promise<FailedMutation[]> {
  const raw = await persistStorage.getItem(STORE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as FailedMutation[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeStored(items: FailedMutation[]): Promise<void> {
  await persistStorage.setItem(STORE_KEY, JSON.stringify(items));
  const snapshot = [...items];
  listeners.forEach((l) => l(snapshot));
}

/** Subscribe to failed-outbox changes; returns an unsubscribe fn. */
export function subscribeFailedMutations(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function listFailedMutations(): Promise<FailedMutation[]> {
  return readStored();
}

/**
 * Records a mutation that failed its final retry. Deduplicates by (key + JSON of
 * variables) so replaying the same dropped mutation twice does not pile up
 * duplicate entries.
 */
export async function enqueueFailedMutation(input: {
  key: readonly (string | number)[];
  variables: unknown;
  label: string;
}): Promise<void> {
  // MAJOR-3 gate: a mutation that finishes retrying AFTER the user logged out (or
  // was force-logged-out by the 401 teardown) must not resurrect its payload in the
  // now-empty store. Read live auth state, never a closure.
  if (!isAuthenticatedGate()) return;
  const items = await readStored();
  const varsJson = JSON.stringify(input.variables);
  const keyJson = JSON.stringify(input.key);
  const exists = items.some(
    (i) => JSON.stringify(i.key) === keyJson && JSON.stringify(i.variables) === varsJson,
  );
  if (exists) return;
  items.push({
    id: safeRandomUUID(),
    key: input.key,
    variables: input.variables,
    label: input.label,
    failedAt: new Date().toISOString(),
  });
  await writeStored(items);
}

/**
 * Fire-and-forget persist of a mutation that exhausted its retries, applied on
 * BOTH the in-session hook `onError` and the cold-boot replay `onError` in the
 * mutation defaults. Skips non-retriable 4xx (MAJOR-2b) and is a no-op when signed
 * out (MAJOR-3). Best-effort: a persistence failure must never throw back into the
 * mutation lifecycle. Dedupe by (key + variables) inside enqueueFailedMutation
 * keeps the two paths from ever double-writing the same payload.
 */
export function persistFailedMutation(
  key: readonly (string | number)[],
  variables: unknown,
  label: string,
  error: unknown,
): void {
  if (!isRetriableFailure(error)) return;
  void enqueueFailedMutation({ key, variables, label }).catch(() => {});
}

export async function removeFailedMutation(id: string): Promise<void> {
  const items = await readStored();
  await writeStored(items.filter((i) => i.id !== id));
}

export async function clearFailedMutations(): Promise<void> {
  await writeStored([]);
}

/** Restore an owner's stranded actions and notify an already-mounted indicator. */
export async function restoreFailedMutations(raw: string): Promise<void> {
  const saved = JSON.parse(raw) as FailedMutation[];
  if (!Array.isArray(saved)) throw new Error('Invalid failed outbox');
  const current = await readStored();
  const byId = new Map([...current, ...saved].map((item) => [item.id, item]));
  await writeStored([...byId.values()]);
}
