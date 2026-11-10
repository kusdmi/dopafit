import type { QueryClient } from '@tanstack/react-query';

import { resetPendingBodies } from '@/shared/api/client';
import { preserveOwnerOutbox } from '@/shared/lib/offline/session-outbox';
import { reportStorageError } from '@/shared/lib/platform/storage/errors';

import { useSessionStore } from './store';

/**
 * App-level QueryClient, registered once from `App` on mount. The 'unauthorized'
 * teardown path (see store.ts) has no access to React context, so it reads the
 * client from here. Kept in this module (not in the store, which lives in
 * `entities`) to avoid an `entities → app` import.
 */
let appQueryClient: QueryClient | null = null;
let sessionChannel: BroadcastChannel | null = null;
const SESSION_CHANNEL = 'dopafit.session';

export function registerQueryClient(client: QueryClient): void {
  appQueryClient = client;
}

/** Keep each open web tab's in-memory auth state in sync with logout. */
export function registerSessionSync(client: QueryClient): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => {};
  const channel = new BroadcastChannel(SESSION_CHANNEL);
  sessionChannel = channel;
  channel.onmessage = (event: MessageEvent<unknown>) => {
    const message = event.data;
    if (
      !message ||
      typeof message !== 'object' ||
      !('signedOutUserId' in message) ||
      typeof message.signedOutUserId !== 'string' ||
      useSessionStore.getState().user?.id !== message.signedOutUserId
    ) {
      return;
    }
    // This tab has its own Zustand and QueryClient instances. The shared disk
    // wipe in the other tab cannot remove either in-memory copy.
    void clearAllSessionData(client);
  };
  return () => {
    if (sessionChannel === channel) sessionChannel = null;
    channel.close();
  };
}

function broadcastSignOut(userId: string | undefined): void {
  if (userId) sessionChannel?.postMessage({ signedOutUserId: userId });
}

/**
 * Full local teardown of the previous session, in the one order that is safe:
 *
 *  1. Archive the outgoing owner's unsent work before wiping shared storage.
 *  2. `queryClient.clear()` — drop the in-memory cache FIRST. If we cleared disk
 *     first, the still-subscribed persister would re-dehydrate the in-memory data
 *     right back onto disk on the next cache event, undoing the wipe.
 *  3. `clearSession()` — tokens + shared query cache/outbox + auth flag + the
 *     workout store. Runs after the in-memory clear so nothing gets rewritten.
 *  4. `resetPendingBodies()` — drops any buffered request-body ArrayBuffers left
 *     in the API client's retry map (normally self-cleaning; this is the safety
 *     valve for the orphan edge case documented in shared/api/client.ts). Cheap
 *     and order-independent, so it runs alongside the rest of the wipe.
 *
 * `clearSession()` is awaited so callers can guarantee storage (idb / Keychain /
 * SQLite) is fully wiped before doing anything that unloads the page.
 */
async function clearAllSessionData(
  queryClient: QueryClient | null,
  preserveForUserId?: string,
): Promise<void> {
  if (queryClient && preserveForUserId) {
    try {
      await preserveOwnerOutbox(queryClient, preserveForUserId);
    } catch {
      // A storage failure must not keep an expired or signed-out session alive.
      reportStorageError();
    }
  }
  queryClient?.clear();
  await useSessionStore.getState().clearSession();
  resetPendingBodies();
}

/**
 * Runs when the API client emits 'unauthorized' (refresh token is dead). Performs
 * the same local teardown as an explicit logout, but WITHOUT a hard navigation:
 * route guards react to the cleared auth flag and SPA-redirect to /welcome, which
 * preserves the current UX. The teardown must be full: clearing only the store
 * would leave the in-memory cache — and, via the still-live persister, the disk
 * cache — holding the previous user's data.
 */
export async function teardownOnUnauthorized(): Promise<void> {
  const userId = useSessionStore.getState().user?.id;
  await clearAllSessionData(appQueryClient, userId);
  broadcastSignOut(userId);
}

/**
 * Полный teardown сессии и выход на гостевой экран.
 *
 * Используется и в logout, и на экране прощания после удаления аккаунта
 * (DeleteAccountPage), чтобы их поведение не разъезжалось:
 *  1. `clearAllSessionData` — in-memory + persisted кэш, токены, auth-флаг.
 *     Ждём его ПОЛНОСТЬЮ (await), иначе `window.location.assign` может выгрузить
 *     документ до завершения очистки idb/Keychain/SQLite.
 *  2. Online: hard-navigate to /welcome to reset component state and timers.
 *     Offline: the protected route guard redirects within the loaded app because
 *     a document reload would show the browser's network error page.
 *
 * Принимает `queryClient` параметром (а не хук), а сам стор читает через
 * `useSessionStore.getState()` — поэтому функцию можно вызвать из любого
 * обработчика без правил хуков.
 *
 * `toastFlag` (опционально) — ключ в sessionStorage, который выставляется
 * НЕПОСРЕДСТВЕННО перед `window.location.assign`. Ставить его раньше нельзя: при
 * В гонке очистка сессии флипает isAuthenticated, route-guard SPA-редиректит
 * на /welcome, и WelcomePage успевает сконсюмить флаг и показать toast в
 * документе, который тут же перезагружается hard-navigation'ом — toast теряется.
 * Выставляя флаг физически лишь в момент навигации, гарантируем, что первым его
 * увидит уже перезагруженный /welcome.
 */
export async function signOutAndExit(
  queryClient: QueryClient,
  options?: { toastFlag?: string; preservePending?: boolean },
): Promise<void> {
  const userId = useSessionStore.getState().user?.id;
  await clearAllSessionData(queryClient, options?.preservePending === false ? undefined : userId);
  broadcastSignOut(userId);
  if (options?.toastFlag) {
    try {
      sessionStorage.setItem(options.toastFlag, '1');
    } catch {
      // Приватный режим / недоступный storage — тост просто не покажем.
    }
  }
  // A hard navigation cannot load /welcome while offline. The protected route
  // guard reacts to the cleared auth state and renders the guest screen from the
  // already-loaded app; the full cache/token/workout wipe above still runs.
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  window.location.assign('/welcome');
}
