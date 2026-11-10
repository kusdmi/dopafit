import { env } from '@/shared/config/env';

import { tokenStorage } from './tokens';
import { fetchApi } from './network-fetch';

/**
 * Outcome of a token refresh attempt:
 *  - `refreshed` — new tokens stored, original request can be replayed.
 *  - `fatal` — the refresh token is genuinely dead (401/403/422, or no refresh
 *    token at all). Caller must bail: clear tokens and force logout.
 *  - `transient` — a temporary failure (network error, 5xx, 429). Tokens are
 *    UNTOUCHED; the caller should surface the original request's failure without
 *    logging the user out, so TanStack retries / the user can try again.
 */
export type RefreshOutcome = 'refreshed' | 'fatal' | 'transient';

/** Refresh HTTP statuses that mean the refresh token itself is invalid. */
const FATAL_STATUSES = new Set([401, 403, 422]);

let inFlight: Promise<RefreshOutcome> | null = null;

async function doRefresh(): Promise<RefreshOutcome> {
  const refresh = await tokenStorage.getRefresh();
  if (!refresh) return 'fatal';
  // Capture the session generation before the network round-trip. If a logout
  // (or unauthorized teardown) bumps it while this request is in flight, we must
  // NOT write the rotated pair — that would resurrect valid tokens on a device
  // that already signed out.
  const generation = tokenStorage.getGeneration();
  try {
    const res = await fetchApi(`${env.apiUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!res.ok) {
      // The token is only dead on an auth-level rejection. 5xx/429 (and anything
      // else) are transient — don't nuke the session over a flaky server.
      return FATAL_STATUSES.has(res.status) ? 'fatal' : 'transient';
    }
    const data = (await res.json()) as { access_token: string; refresh_token: string };
    if (tokenStorage.getGeneration() !== generation) {
      // The session was torn down mid-refresh; drop the rotated pair. Report
      // fatal so the caller bails instead of replaying against a dead session.
      return 'fatal';
    }
    await tokenStorage.set(data.access_token, data.refresh_token);
    // TOCTOU: a logout/teardown (which bumps the generation and clears storage)
    // could land BETWEEN the check above and this set() resolving, so the rotated
    // pair we just wrote would resurrect a signed-out session. Re-check AFTER the
    // write; on a mismatch re-clear so the fresh tokens can't survive the logout.
    if (tokenStorage.getGeneration() !== generation) {
      await tokenStorage.clear();
      return 'fatal';
    }
    return 'refreshed';
  } catch {
    // Network drop / abort mid-request — transient, keep the tokens.
    return 'transient';
  }
}

/**
 * Refreshes the access token, coalescing concurrent callers onto one request
 * so parallel 401s trigger only a single /auth/refresh call.
 */
export function ensureRefreshed(): Promise<RefreshOutcome> {
  if (!inFlight) {
    inFlight = doRefresh().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

/** Clears the single-flight state so tests can isolate module state. */
export function resetRefreshState(): void {
  inFlight = null;
}
