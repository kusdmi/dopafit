export interface Release {
  buildId: string;
}

/** This URL must bypass both the HTTP cache and the service worker precache. */
export async function fetchRelease(signal?: AbortSignal): Promise<Release> {
  const response = await fetch('/version.json', { cache: 'no-store', signal });
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json'))
    throw new Error('Release manifest is unavailable');
  const release: unknown = await response.json();
  if (
    !release ||
    typeof release !== 'object' ||
    !('buildId' in release) ||
    typeof release.buildId !== 'string' ||
    !/^[a-zA-Z0-9-]{8,100}$/.test(release.buildId)
  )
    throw new Error('Invalid release manifest');
  return { buildId: release.buildId };
}

const ATTEMPT_KEY = 'dopafit.release-reload';

/** A stale intermediary must not trap a user in an automatic reload loop. */
export function wasReloadAttempted(buildId: string): boolean {
  try {
    return sessionStorage.getItem(ATTEMPT_KEY) === buildId;
  } catch {
    return true;
  }
}

export function recordReloadAttempt(buildId: string): void {
  try {
    sessionStorage.setItem(ATTEMPT_KEY, buildId);
  } catch {
    // Reload still works when storage is disabled; automatic retries are disabled above.
  }
}
