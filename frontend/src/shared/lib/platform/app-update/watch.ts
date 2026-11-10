import { createUpdateManager } from './manager';
import { BUILD_MESSAGE, CLEANUP_MESSAGE, registerReleaseWorker } from './worker';

const CHECK_INTERVAL = 5 * 60_000;

/** The same lifecycle runs in a regular browser tab and an installed web app. */
export function watchAppUpdates(
  options: Omit<Parameters<typeof createUpdateManager>[0], 'automatic'>,
) {
  let interacted = false;
  const interact = () => {
    interacted = true;
  };
  const manager = createUpdateManager({
    ...options,
    automatic: () =>
      !interacted &&
      document.visibilityState === 'visible' &&
      !document.activeElement?.matches('input, textarea, select, [contenteditable="true"]') &&
      !document.querySelector('[role="dialog"]'),
  });
  let lastCheck = 0;
  const check = () => {
    if (document.visibilityState !== 'visible' || Date.now() - lastCheck < 30_000) return;
    lastCheck = Date.now();
    void manager.check();
  };
  const message = (event: MessageEvent) => {
    if (event.data?.type === BUILD_MESSAGE) event.ports[0]?.postMessage(options.currentBuild);
  };
  for (const event of ['pointerdown', 'keydown', 'input', 'change'])
    document.addEventListener(event, interact, { capture: true, passive: true });
  document.addEventListener('visibilitychange', check);
  window.addEventListener('focus', check);
  window.addEventListener('online', check);
  navigator.serviceWorker?.addEventListener('message', message);
  const timer = setInterval(check, CHECK_INTERVAL);
  void registerReleaseWorker()
    .then((registration) => {
      registration?.active?.postMessage({ type: CLEANUP_MESSAGE });
    })
    .catch(() => {});
  check();
  return {
    apply: () => manager.apply(true),
    dispose() {
      manager.dispose();
      clearInterval(timer);
      for (const event of ['pointerdown', 'keydown', 'input', 'change'])
        document.removeEventListener(event, interact, { capture: true });
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
      window.removeEventListener('online', check);
      navigator.serviceWorker?.removeEventListener('message', message);
    },
  };
}
