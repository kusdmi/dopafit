import type { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const calls: string[] = [];
let currentUser: { id: string } | null = null;
const { preserveOwnerOutbox } = vi.hoisted(() => ({ preserveOwnerOutbox: vi.fn() }));
const clearSession = vi.fn(async () => {
  calls.push('clearSession');
  currentUser = null;
});

vi.mock('./store', () => ({
  useSessionStore: { getState: () => ({ clearSession, user: currentUser }) },
}));
vi.mock('@/shared/lib/offline/session-outbox', () => ({ preserveOwnerOutbox }));

import { api, pendingBodiesSizeForTests, resetPendingBodies } from '@/shared/api/client';

import {
  registerQueryClient,
  registerSessionSync,
  signOutAndExit,
  teardownOnUnauthorized,
} from './teardown';

function makeClient(): QueryClient {
  return {
    clear: vi.fn(() => {
      calls.push('queryClient.clear');
    }),
  } as unknown as QueryClient;
}

describe('session teardown', () => {
  const realLocation = window.location;
  let assignSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    calls.length = 0;
    currentUser = null;
    vi.clearAllMocks();
    preserveOwnerOutbox.mockImplementation(async () => {
      calls.push('preserveOwnerOutbox');
    });
    assignSpy = vi.fn(() => {
      calls.push('assign');
    });
    const locationStub = new Proxy(
      { assign: assignSpy },
      {
        get(overrides, prop) {
          if (prop in overrides) return Reflect.get(overrides, prop);
          const value = Reflect.get(realLocation, prop);
          return typeof value === 'function' ? value.bind(realLocation) : value;
        },
      },
    );
    Object.defineProperty(window, 'location', { configurable: true, value: locationStub });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
  });

  describe('cross-tab sign-out', () => {
    it('broadcasts the signed-out user only after the local wipe', async () => {
      const sent: unknown[] = [];
      class FakeChannel {
        onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
        constructor(public name: string) {}
        postMessage(message: unknown) {
          sent.push(message);
          calls.push('broadcast');
        }
        close() {}
      }
      vi.stubGlobal('BroadcastChannel', FakeChannel);
      currentUser = { id: 'u1' };
      const unbind = registerSessionSync(makeClient());

      await signOutAndExit(makeClient());

      expect(sent).toEqual([{ signedOutUserId: 'u1' }]);
      expect(calls).toEqual([
        'preserveOwnerOutbox',
        'queryClient.clear',
        'clearSession',
        'broadcast',
        'assign',
      ]);
      unbind();
    });

    it('wipes an open tab only when the signed-out account matches', async () => {
      const channels: FakeChannel[] = [];
      class FakeChannel {
        onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
        constructor() {
          channels.push(this);
        }
        close() {}
      }
      vi.stubGlobal('BroadcastChannel', FakeChannel);
      currentUser = { id: 'u1' };
      const client = makeClient();
      const unbind = registerSessionSync(client);
      const receive = (signedOutUserId: string) =>
        channels[0].onmessage!({ data: { signedOutUserId } } as MessageEvent<unknown>);

      receive('other-account');
      expect(client.clear).not.toHaveBeenCalled();
      receive('u1');
      await vi.waitFor(() => expect(clearSession).toHaveBeenCalledTimes(1));
      expect(calls).toEqual(['queryClient.clear', 'clearSession']);
      expect(assignSpy).not.toHaveBeenCalled();
      unbind();
    });
  });

  describe('teardownOnUnauthorized (F2)', () => {
    it('clears the in-memory query cache BEFORE wiping disk, without navigating', async () => {
      const client = makeClient();
      registerQueryClient(client);

      await teardownOnUnauthorized();

      expect(client.clear).toHaveBeenCalledTimes(1);
      expect(clearSession).toHaveBeenCalledTimes(1);
      // In-memory clear must run before the disk wipe (clearSession), or the live
      // persister re-dehydrates the previous user's data straight back to disk.
      expect(calls).toEqual(['queryClient.clear', 'clearSession']);
      // The 'unauthorized' path relies on guard SPA-redirects — no hard navigate.
      expect(assignSpy).not.toHaveBeenCalled();
    });
  });

  describe('signOutAndExit (F4)', () => {
    it('keeps offline logout in the loaded app so the guest route can render', async () => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
      currentUser = { id: 'u1' };

      await signOutAndExit(makeClient());

      expect(clearSession).toHaveBeenCalledTimes(1);
      expect(assignSpy).not.toHaveBeenCalled();
    });
    it('preserves pending work for logout but not for account deletion', async () => {
      currentUser = { id: 'u1' };
      await signOutAndExit(makeClient(), { preservePending: false });
      expect(preserveOwnerOutbox).not.toHaveBeenCalled();
    });
    it('awaits the full teardown before hard-navigating to /welcome', async () => {
      const client = makeClient();

      await signOutAndExit(client);

      // clearSession must fully resolve BEFORE window.location.assign, otherwise
      // the page unload can abort the idb/Keychain/SQLite wipe mid-flight.
      expect(calls).toEqual(['queryClient.clear', 'clearSession', 'assign']);
      expect(assignSpy).toHaveBeenCalledWith('/welcome');
    });

    it('does not touch sessionStorage when no toastFlag is passed', async () => {
      const client = makeClient();
      const setSpy = vi.spyOn(Storage.prototype, 'setItem');

      await signOutAndExit(client);

      expect(setSpy).not.toHaveBeenCalled();
      setSpy.mockRestore();
    });

    it('sets the toastFlag only immediately before navigating (UX-6 race fix)', async () => {
      const client = makeClient();
      const FLAG = 'account-deleted-toast';
      // Record when the flag is written relative to the teardown order.
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key) => {
        if (key === FLAG) calls.push(`setItem:${FLAG}`);
      });

      await signOutAndExit(client, { toastFlag: FLAG });

      // The flag must NOT exist before the wipe (or a SPA-redirect could consume
      // it pre-reload); it is written right before assign.
      expect(calls).toEqual([
        'queryClient.clear',
        'clearSession',
        `setItem:${FLAG}`,
        'assign',
      ]);
      vi.restoreAllMocks();
    });
  });

  describe('pendingBodies leak valve', () => {
    afterEach(() => resetPendingBodies());

    it('empties the API client pendingBodies map as part of the teardown', async () => {
      // Simulate the orphan edge case documented in shared/api/client.ts: an
      // onRequest buffer that never reaches onResponse/onError, e.g. because the
      // request is still in flight when the session is torn down mid-navigation.
      // A hanging fetch leaves onRequest's buffered ArrayBuffer in the map since
      // neither onResponse nor onError has run yet.
      const hang = new Promise<Response>(() => {
        /* never resolves, matching an in-flight request at teardown time */
      });
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockReturnValue(hang);
      void api.POST('/api/v1/programs', { body: { id: 'x', name: 'x', kind: 'strength', days: [] } });
      // Let onRequest's middleware run (it awaits tokenStorage.getAccess()) before
      // asserting the buffer landed in the map.
      await vi.waitFor(() => expect(pendingBodiesSizeForTests()).toBeGreaterThan(0));

      const client = makeClient();
      await signOutAndExit(client);

      expect(pendingBodiesSizeForTests()).toBe(0);
      fetchSpy.mockRestore();
    });
  });
});
