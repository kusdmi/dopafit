export const BUILD_MESSAGE = 'DOPAFIT_GET_BUILD';
export const CLEANUP_MESSAGE = 'DOPAFIT_CLEANUP_STATIC';
export const STATIC_CACHE_PREFIX = 'dopafit-static-';

export function readWorkerBuild(worker: {
  postMessage(message: unknown, transfer: Transferable[]): void;
}): Promise<string | null> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const finish = (build: string | null) => {
      clearTimeout(timer);
      channel.port1.close();
      channel.port2.close();
      resolve(build);
    };
    const timer = setTimeout(() => finish(null), 2000);
    channel.port1.onmessage = (event: MessageEvent<unknown>) =>
      finish(typeof event.data === 'string' ? event.data : null);
    try {
      worker.postMessage({ type: BUILD_MESSAGE }, [channel.port2]);
    } catch {
      finish(null);
    }
  });
}

function waitForWorkerChange(registration: ServiceWorkerRegistration): Promise<void> {
  return new Promise((resolve) => {
    const installing = registration.installing;
    const finish = () => {
      clearTimeout(timer);
      installing?.removeEventListener('statechange', changed);
      resolve();
    };
    const changed = () => {
      if (!installing || ['installed', 'activated', 'redundant'].includes(installing.state))
        finish();
    };
    const timer = setTimeout(finish, 15_000);
    installing?.addEventListener('statechange', changed);
    changed();
  });
}

/** Activate only the worker built with the exact release we intend to load. */
export async function prepareWorker(buildId: string): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) {
    if (navigator.serviceWorker.controller) throw new Error('Worker registration unavailable');
    return;
  }
  await registration.update();
  await waitForWorkerChange(registration);
  if (registration.active && (await readWorkerBuild(registration.active)) === buildId) return;
  const waiting = registration.waiting;
  if (!waiting || (await readWorkerBuild(waiting)) !== buildId)
    throw new Error('Release worker is not ready');
  await new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer);
      waiting.removeEventListener('statechange', changed);
      if (error) reject(error);
      else resolve();
    };
    const changed = () => {
      if (waiting.state === 'activated') finish();
      else if (waiting.state === 'redundant') finish(new Error('Worker installation failed'));
    };
    const timer = setTimeout(() => finish(new Error('Worker activation timed out')), 15_000);
    waiting.addEventListener('statechange', changed);
    waiting.postMessage({ type: 'SKIP_WAITING' });
    changed();
  });
}

/** Registration also applies to ordinary browser tabs; installation is optional. */
export function registerReleaseWorker(): Promise<ServiceWorkerRegistration | undefined> {
  if (!('serviceWorker' in navigator)) return Promise.resolve(undefined);
  return navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
}
