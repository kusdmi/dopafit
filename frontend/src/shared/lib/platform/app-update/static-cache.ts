import { readWorkerBuild, STATIC_CACHE_PREFIX } from './worker';

interface BuildClient {
  postMessage(message: unknown, transfer: Transferable[]): void;
}

function ownsCache(name: string, scope: string): boolean {
  return name.startsWith(STATIC_CACHE_PREFIX) || name === `workbox-precache-v2-${scope}`;
}

/** Old tabs still need their lazy chunks, even after another tab applies a release. */
export async function cleanupStaticCaches(
  currentCache: string,
  scope: string,
  clients: readonly BuildClient[],
): Promise<void> {
  const builds = await Promise.all(clients.map(readWorkerBuild));
  if (builds.some((build) => !build || `${STATIC_CACHE_PREFIX}${build}` !== currentCache)) return;
  const keys = await caches.keys();
  await Promise.all(
    keys
      .filter((key) => key !== currentCache && ownsCache(key, scope))
      .map((key) => caches.delete(key)),
  );
}

/** Only application assets may fall back to retained release caches, never API data. */
export async function fetchStaticAsset(request: Request, scope: string): Promise<Response> {
  let response: Response | undefined;
  try {
    response = await fetch(request);
    if (response.ok) return response;
  } catch {
    // A previous build can still be open while the server already serves the next one.
  }
  for (const key of await caches.keys()) {
    if (!ownsCache(key, scope)) continue;
    const cached = await (await caches.open(key)).match(request);
    if (cached) return cached;
  }
  return response ?? Response.error();
}
