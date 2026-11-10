import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { prepareWorker, registerReleaseWorker, readWorkerBuild } from './worker';

class Port {
  peer?: Port;
  onmessage?: (event: { data: unknown }) => void;
  postMessage(data: unknown) {
    this.peer?.onmessage?.({ data });
  }
  close() {}
}
class Channel {
  port1 = new Port();
  port2 = new Port();
  constructor() {
    this.port1.peer = this.port2;
    this.port2.peer = this.port1;
  }
}

class Worker extends EventTarget {
  state: ServiceWorkerState = 'installed';
  constructor(readonly build = 'release-next') {
    super();
  }
  postMessage = vi.fn((message: { type: string }, ports?: Port[]) => {
    if (message.type === 'DOPAFIT_GET_BUILD') ports?.[0]?.postMessage(this.build);
    if (message.type === 'SKIP_WAITING') {
      this.state = 'activated';
      this.dispatchEvent(new Event('statechange'));
    }
  });
}

beforeEach(() => vi.stubGlobal('MessageChannel', Channel));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('supports the web version when service workers are unavailable', async () => {
  vi.stubGlobal('navigator', {});
  await expect(prepareWorker('release-next')).resolves.toBeUndefined();
  await expect(registerReleaseWorker()).resolves.toBeUndefined();
});

it('registers with fresh script checks in ordinary tabs as well as standalone', async () => {
  const register = vi.fn().mockResolvedValue({});
  vi.stubGlobal('navigator', { serviceWorker: { register } });
  await registerReleaseWorker();
  expect(register).toHaveBeenCalledWith('/sw.js', { updateViaCache: 'none' });
});

it('does not skip a waiting worker until its build matches the release', async () => {
  const active = new Worker('release-current');
  const waiting = new Worker();
  const update = vi.fn(async () => {});
  vi.stubGlobal('navigator', {
    serviceWorker: { getRegistration: async () => ({ active, waiting, update }) },
  });
  await prepareWorker('release-next');
  expect(update).toHaveBeenCalledOnce();
  expect(waiting.state).toBe('activated');
  expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
});

it('refuses to activate a worker from a different deployment', async () => {
  const waiting = new Worker('release-other');
  vi.stubGlobal('navigator', {
    serviceWorker: { getRegistration: async () => ({ waiting, update: async () => {} }) },
  });
  await expect(prepareWorker('release-next')).rejects.toThrow('not ready');
  expect(waiting.postMessage).not.toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
});

it('accepts an already active matching worker without activation', async () => {
  const active = new Worker();
  vi.stubGlobal('navigator', {
    serviceWorker: { getRegistration: async () => ({ active, update: async () => {} }) },
  });
  await expect(prepareWorker('release-next')).resolves.toBeUndefined();
  expect(active.postMessage).not.toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
});

it('waits for a release download before activating', async () => {
  const installing = new Worker();
  installing.state = 'installing';
  const registration = { installing, waiting: null as Worker | null, update: async () => {} };
  vi.stubGlobal('navigator', { serviceWorker: { getRegistration: async () => registration } });
  const pending = prepareWorker('release-next');
  await Promise.resolve();
  await Promise.resolve();
  expect(installing.postMessage).not.toHaveBeenCalled();
  registration.waiting = installing;
  installing.state = 'installed';
  installing.dispatchEvent(new Event('statechange'));
  await pending;
  expect(installing.state).toBe('activated');
});

it('bounds an unresponsive legacy worker', async () => {
  vi.useFakeTimers();
  const pending = readWorkerBuild({ postMessage() {} });
  await vi.advanceTimersByTimeAsync(2000);
  await expect(pending).resolves.toBeNull();
});
