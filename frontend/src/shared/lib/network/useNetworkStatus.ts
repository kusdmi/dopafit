import { Network } from '@/shared/lib/platform/network';
import type { PluginListenerHandle } from '@capacitor/core';
import { useSyncExternalStore } from 'react';
import { onlineManager } from '@tanstack/react-query';
import { env } from '@/shared/config/env';
import { apiNetworkEvents } from '@/shared/api/events';

const HEARTBEAT_MS = 10_000;
const PROBE_TIMEOUT_MS = 5_000;
const CONFIRM_DELAY_MS = 1_000;
const readNavigatorOnline = () => typeof navigator === 'undefined' || navigator.onLine;
const isHidden = () => document.visibilityState === 'hidden';

let linkUp = readNavigatorOnline();
let isOnline = linkUp;
const listeners = new Set<() => void>();
let intervalId: ReturnType<typeof setInterval> | null = null;
let confirmTimer: ReturnType<typeof setTimeout> | null = null;
let checking = false;
let generation = 0;
let revision = 0;
let failures = 0;
let controller: AbortController | null = null;
let listenerHandlePromise: Promise<PluginListenerHandle> | null = null;
let unsubscribeApi: (() => void) | null = null;

function emit(next: boolean) {
  onlineManager.setOnline(next);
  if (next === isOnline) return;
  isOnline = next;
  listeners.forEach((listener) => listener());
}

function clearConfirmation() {
  if (confirmTimer !== null) clearTimeout(confirmTimer);
  confirmTimer = null;
}

function invalidateProbe() {
  revision++;
  controller?.abort();
  controller = null;
  checking = false;
  clearConfirmation();
}

/** One foreground probe for every subscriber; HTTP errors still prove connectivity. */
async function checkHealth(): Promise<void> {
  if (isHidden() || checking) return;
  if (!linkUp) {
    emit(false);
    return;
  }
  clearConfirmation();
  checking = true;
  const probe = new AbortController();
  controller = probe;
  const currentRevision = revision;
  // A plain AbortController also works in iOS versions without AbortSignal.timeout.
  const timeout = setTimeout(() => probe.abort(), PROBE_TIMEOUT_MS);
  try {
    await fetch(`${env.apiUrl}/api/v1/health`, { signal: probe.signal, cache: 'no-store' });
    if (currentRevision !== revision || isHidden()) return;
    failures = 0;
    emit(linkUp);
  } catch {
    if (currentRevision !== revision || isHidden() || !linkUp) return;
    failures++;
    if (failures >= 2) emit(false);
    else
      confirmTimer = setTimeout(() => {
        void checkHealth();
      }, CONFIRM_DELAY_MS);
  } finally {
    clearTimeout(timeout);
    if (currentRevision === revision) {
      checking = false;
      controller = null;
    }
  }
}

function resume() {
  invalidateProbe();
  failures = 0;
  if (isHidden()) return;
  linkUp = readNavigatorOnline();
  if (!linkUp) emit(false);
  void checkHealth();
}

function start() {
  if (intervalId !== null) return;
  const currentGeneration = generation;
  linkUp = readNavigatorOnline();
  if (!linkUp) emit(false);
  window.addEventListener('focus', resume);
  document.addEventListener('visibilitychange', resume);
  unsubscribeApi = apiNetworkEvents.on((event) => {
    if (isHidden()) return;
    if (event === 'reachable' && linkUp) {
      invalidateProbe();
      failures = 0;
      emit(true);
    } else void checkHealth();
  });
  listenerHandlePromise = Network.addListener('networkStatusChange', (status) => {
    if (currentGeneration !== generation) return;
    invalidateProbe();
    failures = 0;
    linkUp = status.connected;
    if (!linkUp) emit(false);
    else void checkHealth();
  });
  const initialRevision = revision;
  void Network.getStatus()
    .then((status) => {
      if (currentGeneration !== generation || initialRevision !== revision || intervalId === null)
        return;
      if (status.connected === linkUp) return;
      linkUp = status.connected;
      if (!linkUp) {
        invalidateProbe();
        emit(false);
      } else void checkHealth();
    })
    .catch(() => {
      /* The browser signal and heartbeat remain available. */
    });
  intervalId = setInterval(() => {
    void checkHealth();
  }, HEARTBEAT_MS);
  void checkHealth();
}

function stop() {
  const handle = listenerHandlePromise;
  listenerHandlePromise = null;
  if (handle) void handle.then((listener) => listener.remove()).catch(() => {});
  unsubscribeApi?.();
  unsubscribeApi = null;
  generation++;
  invalidateProbe();
  failures = 0;
  window.removeEventListener('focus', resume);
  document.removeEventListener('visibilitychange', resume);
  if (intervalId !== null) clearInterval(intervalId);
  intervalId = null;
}

export function subscribeNetworkStatus(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) start();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stop();
  };
}

export function getNetworkSnapshot(): boolean {
  return isOnline;
}

export function useNetworkStatus() {
  const online = useSyncExternalStore(
    subscribeNetworkStatus,
    getNetworkSnapshot,
    getNetworkSnapshot,
  );
  return { isOnline: online, isOffline: !online };
}

export function resetNetworkStatusForTests(): void {
  stop();
  listeners.clear();
  linkUp = readNavigatorOnline();
  isOnline = linkUp;
  onlineManager.setOnline(linkUp);
}

export function __getCheckingForTests(): boolean {
  return checking;
}
