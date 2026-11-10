import type { ConnectionStatus } from '@capacitor/network';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiNetworkEvents } from '@/shared/api/events';

import {
  resetNetworkStatusForTests,
  useNetworkStatus,
  __getCheckingForTests,
} from './useNetworkStatus';
vi.mock('@/shared/config/env', () => ({ env: { isNative: true, apiUrl: 'http://localhost' } }));

// ---- @capacitor/network mock ------------------------------------------------
// Network.addListener captures the callback so tests can fire connectivity
// events manually. Network.getStatus() returns a controllable connected state.
// Overrides the passthrough mock from shared/test/setup.ts for this file.

type NetworkStatusChangeCallback = (status: ConnectionStatus) => void;

let capturedCallback: NetworkStatusChangeCallback | null = null;
let mockConnected = true;

vi.mock('@capacitor/network', () => ({
  Network: {
    getStatus: vi.fn(async () => ({ connected: mockConnected, connectionType: 'wifi' })),
    addListener: vi.fn(
      (_event: string, callback: NetworkStatusChangeCallback): Promise<{ remove: () => void }> => {
        capturedCallback = callback;
        return Promise.resolve({ remove: vi.fn() });
      },
    ),
  },
}));

describe('useNetworkStatus (shared heartbeat)', () => {
  beforeEach(() => {
    capturedCallback = null;
    mockConnected = true;
    resetNetworkStatusForTests();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });

  afterEach(() => {
    resetNetworkStatusForTests();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('detects a failed API connection without waiting for the heartbeat and recovers on the next tick', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.mocked(fetch);
    const a = renderHook(() => useNetworkStatus());
    const b = renderHook(() => useNetworkStatus());
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockRejectedValueOnce(new TypeError('network down'));
    await act(async () => {
      apiNetworkEvents.emit();
    });
    expect(a.result.current.isOnline).toBe(true);
    expect(b.result.current.isOnline).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockRejectedValueOnce(new TypeError('still down'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(a.result.current.isOffline).toBe(true);
    expect(b.result.current.isOffline).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(a.result.current.isOnline).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    a.unmount();
    b.unmount();
    apiNetworkEvents.emit();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('does not multiply probes when many API requests fail while a health request is running', async () => {
    let resolveProbe!: (response: Response) => void;
    vi.mocked(fetch).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveProbe = resolve;
        }),
    );
    const { unmount } = renderHook(() => useNetworkStatus());
    for (let index = 0; index < 50; index++) apiNetworkEvents.emit();
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveProbe(new Response(null, { status: 200 }));
    });
    unmount();
  });

  it('shares a single probe across multiple consumers', async () => {
    const a = renderHook(() => useNetworkStatus());
    const b = renderHook(() => useNetworkStatus());

    await waitFor(() => expect(a.result.current.isOnline).toBe(true));
    expect(b.result.current.isOnline).toBe(true);

    // Both mounted consumers triggered exactly one shared probe, not one each.
    expect(fetch).toHaveBeenCalledTimes(1);

    a.unmount();
    b.unmount();
  });

  it('flips every consumer offline only after two failed foreground probes', async () => {
    vi.useFakeTimers();
    (fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('down'));
    const a = renderHook(() => useNetworkStatus());
    const b = renderHook(() => useNetworkStatus());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(a.result.current.isOffline).toBe(true);
    expect(b.result.current.isOffline).toBe(true);

    a.unmount();
    b.unmount();
  });

  it('falls back to AbortController when AbortSignal.timeout is unavailable (iOS 15)', async () => {
    // iOS 15 WebKit has no AbortSignal.timeout; touching it there throws, which
    // previously rejected every probe and wedged the app offline. Simulate its
    // absence and assert the probe still completes and reports online.
    const originalTimeout = AbortSignal.timeout;
    // @ts-expect-error deliberately removing the method to emulate iOS 15.
    AbortSignal.timeout = undefined;

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({ ok: true });

    const { result, unmount } = renderHook(() => useNetworkStatus());

    await waitFor(() => expect(result.current.isOnline).toBe(true));
    // The fallback still passes an abort signal (from AbortController), not undefined.
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    AbortSignal.timeout = originalTimeout;
    unmount();
  });

  it('reports offline immediately when navigator is offline without probing', async () => {
    // Simulate navigator.onLine = false so linkUp starts false, and the Capacitor
    // plugin also reports disconnected.
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    mockConnected = false;

    const { result, unmount } = renderHook(() => useNetworkStatus());

    // Fire the captured Capacitor callback with connected:false to drive the module.
    await act(async () => {
      capturedCallback?.({ connected: false, connectionType: 'none' });
    });

    await waitFor(() => expect(result.current.isOffline).toBe(true));
    // No health probe should have been issued — the link is known to be down.
    expect(fetch).not.toHaveBeenCalled();

    spy.mockRestore();
    unmount();
  });

  it('triggers a health probe and reports online when network reconnects', async () => {
    // Start offline so the reconnection event is meaningful.
    mockConnected = false;
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });

    const { result, unmount } = renderHook(() => useNetworkStatus());

    // Drive offline via Capacitor event.
    await act(async () => {
      capturedCallback?.({ connected: false, connectionType: 'none' });
    });
    await waitFor(() => expect(result.current.isOffline).toBe(true));

    // Now simulate reconnection.
    await act(async () => {
      capturedCallback?.({ connected: true, connectionType: 'wifi' });
    });

    await waitFor(() => expect(result.current.isOnline).toBe(true));
    // A health probe must have been triggered by the reconnection event.
    expect(fetch).toHaveBeenCalled();

    unmount();
  });

  it('does not leave `checking` stuck after stop() while a probe is in flight', async () => {
    // A fetch that never settles simulates the last subscriber unmounting
    // (triggering stop()) while checkHealth()'s fetch is still in flight.
    const releaseFetchBox: { current: (() => void) | null } = { current: null };
    (fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      () =>
        new Promise<{ ok: boolean }>((resolve) => {
          releaseFetchBox.current = (): void => resolve({ ok: true });
        }),
    );

    const first = renderHook(() => useNetworkStatus());
    // Let start()'s initial checkHealth() call reach `checking = true`.
    await waitFor(() => expect(__getCheckingForTests()).toBe(true));

    // Last subscriber unmounts mid-probe -> stop(). Without the fix, `checking`
    // would still read true here, wedging the NEXT cycle's checkHealth() no-op.
    first.unmount();
    expect(__getCheckingForTests()).toBe(false);

    // A new subscriber mounts immediately (start() -> checkHealth()). It must
    // not be blocked by the stale flag from the old (still-unsettled) probe.
    const secondFetchCall = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
    const second = renderHook(() => useNetworkStatus());
    await waitFor(() =>
      expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(
        secondFetchCall,
      ),
    );

    // Clean up the still-pending first probe so it doesn't leak into other tests.
    releaseFetchBox.current?.();
    second.unmount();
  });

  it('keeps HTTP 503 online and accepts a newer API response over a stale failed probe', async () => {
    let reject!: (error: Error) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        () =>
          new Promise((_resolve, fail) => {
            reject = fail;
          }),
      ),
    );
    const view = renderHook(useNetworkStatus);
    await act(async () => {
      apiNetworkEvents.emit('reachable');
      reject(new Error('stale'));
    });
    expect(view.result.current.isOnline).toBe(true);
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 503 }));
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(view.result.current.isOnline).toBe(true);
    view.unmount();
  });

  it('ignores failures while hidden and probes afresh on return', async () => {
    vi.useFakeTimers();
    let reject!: (error: Error) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        () =>
          new Promise((_resolve, fail) => {
            reject = fail;
          }),
      ),
    );
    const view = renderHook(useNetworkStatus);
    const visibility = vi.spyOn(document, 'visibilityState', 'get');
    await act(async () => {
      visibility.mockReturnValue('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      reject(new Error('suspended'));
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(view.result.current.isOnline).toBe(true);
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));
    await act(async () => {
      visibility.mockReturnValue('visible');
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(view.result.current.isOnline).toBe(true);
    view.unmount();
  });
});
