import { afterEach, expect, it, vi } from 'vitest';
import { cleanupStaticCaches, fetchStaticAsset } from './static-cache';
import { readWorkerBuild } from './worker';

vi.mock('./worker', () => ({ STATIC_CACHE_PREFIX: 'dopafit-static-', readWorkerBuild: vi.fn() }));
const scope = 'https://app.test/';
const clients = [{ postMessage() {} }];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('removes only obsolete application static caches after all tabs report the new build', async () => {
  vi.mocked(readWorkerBuild).mockResolvedValue('release-next');
  const remove = vi.fn(async (_name: string) => true);
  vi.stubGlobal('caches', {
    keys: async () => [
      'dopafit-static-release-next',
      'dopafit-static-release-old',
      `workbox-precache-v2-${scope}`,
      'other-app',
      'private-data',
    ],
    delete: remove,
  });
  await cleanupStaticCaches('dopafit-static-release-next', scope, clients);
  expect(remove.mock.calls.map(([name]) => name)).toEqual([
    'dopafit-static-release-old',
    `workbox-precache-v2-${scope}`,
  ]);
});

it.each(['release-old', null])(
  'keeps old chunks while a tab is on an older or unresponsive build: %s',
  async (build) => {
    vi.mocked(readWorkerBuild).mockResolvedValue(build);
    const remove = vi.fn();
    vi.stubGlobal('caches', { keys: async () => ['dopafit-static-release-old'], delete: remove });
    await cleanupStaticCaches('dopafit-static-release-next', scope, clients);
    expect(remove).not.toHaveBeenCalled();
  },
);

it('serves a retained old chunk when a deployment removed it from the server', async () => {
  const request = new Request('https://app.test/assets/old.js');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('', { status: 404 })),
  );
  vi.stubGlobal('caches', {
    keys: async () => ['private-data', 'dopafit-static-release-old'],
    open: async () => ({ match: async () => new Response('old module') }),
  });
  expect(await (await fetchStaticAsset(request, scope)).text()).toBe('old module');
});

it('does not use unrelated caches to answer an asset request', async () => {
  const open = vi.fn();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('', { status: 404 })),
  );
  vi.stubGlobal('caches', { keys: async () => ['private-data'], open });
  expect(
    (await fetchStaticAsset(new Request('https://app.test/assets/missing.js'), scope)).status,
  ).toBe(404);
  expect(open).not.toHaveBeenCalled();
});
