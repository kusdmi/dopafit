import { localizedErrorMessage } from './localized-error';
import createClient, { type Middleware } from 'openapi-fetch';

import { env } from '@/shared/config/env';
import { requestCaptcha } from '@/shared/lib/captcha/challenge';

import { authEvents } from './events';
import { fetchApi } from './network-fetch';
import { ensureRefreshed } from './refresh';
import type { paths } from './schema';
import { tokenStorage } from './tokens';

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

const RETRY_HEADER = 'x-dopafit-retry';

async function bail(response: Response): Promise<Response> {
  await tokenStorage.clear();
  authEvents.emit('unauthorized');
  return response;
}

function isRefreshUrl(url: string): boolean {
  try {
    return new URL(url).pathname.endsWith('/api/v1/auth/refresh');
  } catch {
    return url.includes('/auth/refresh');
  }
}

// openapi-fetch dispatches fetch() before onResponse runs, which consumes the
// request body stream — so request.clone() in onResponse always throws for
// bodied requests. Instead we buffer the body in onRequest (where the request
// is still fresh) keyed by the stable middleware id, and read it back on retry.
// Entries are deleted on both onResponse and onError. NOTE: if this middleware
// is ever composed with another whose onRequest throws (openapi-fetch doesn't
// wrap onRequest in try/catch), an entry could orphan — resetPendingBodies()
// exists as a safety valve for that edge.
const pendingBodies = new Map<string, Promise<ArrayBuffer>>();

const captchaPaths = new Set<keyof paths>([
  '/api/v1/auth/login',
  '/api/v1/auth/login/request-code',
  '/api/v1/auth/password-reset/request',
  '/api/v1/auth/register',
  '/api/v1/auth/resend-code',
  '/api/v1/users/me/contact/change-request',
  '/api/v1/users/me/contact/verify-request',
  '/api/v1/users/me/delete-request',
  '/api/v1/users/me/login-method/request-code',
]);

const captchaMiddleware: Middleware = {
  async onRequest({ request, schemaPath }) {
    if (request.method !== 'POST' || !captchaPaths.has(schemaPath as keyof paths)) return request;
    // Read from the same server that enforces CAPTCHA. No build-time flag or
    // cached offline config can silently turn production verification off.
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (request.signal.aborted) controller.abort();
    request.signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, 10000);
    const result = await api
      .GET('/api/v1/auth/captcha-config', {
        signal: controller.signal,
      })
      .finally(() => {
        clearTimeout(timer);
        request.signal.removeEventListener('abort', abort);
      });
    const { data, error } = result;
    if (error || !data)
      throw {
        code: 'captcha_unavailable',
        message: 'Не удалось загрузить проверку. Попробуйте ещё раз',
      };
    if (!data.site_key) return request;
    const token = await requestCaptcha(data.site_key, request.signal);
    const body = (await request.clone().json()) as Record<string, unknown>;
    return new Request(request, { body: JSON.stringify({ ...body, captcha_token: token }) });
  },
};

const authMiddleware: Middleware = {
  async onRequest({ request, id }) {
    const token = await tokenStorage.getAccess();
    if (token) {
      request.headers.set('Authorization', `Bearer ${token}`);
    }
    const method = request.method.toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
      // Buffer a clone now; the original stream is left intact for fetch().
      pendingBodies.set(id, request.clone().arrayBuffer());
    }
    return request;
  },
  onError({ id }) {
    pendingBodies.delete(id);
  },
  async onResponse({ request, response, id }) {
    const buffered = pendingBodies.get(id);
    pendingBodies.delete(id);
    if (response.status !== 401) return response;
    // Don't loop: a 401 on the refresh call itself, or on an already-retried request.
    if (request.headers.get(RETRY_HEADER) || isRefreshUrl(request.url)) {
      return await bail(response);
    }
    const outcome = await ensureRefreshed();
    if (outcome === 'fatal') return await bail(response);
    // Transient refresh failure (network / 5xx / 429): keep the session intact and
    // let the original 401 propagate. TanStack retry / the user can try again once
    // the refresh endpoint recovers, instead of being force-logged-out.
    if (outcome === 'transient') return response;

    // Replay the original request with the fresh access token and a retry marker.
    // The buffered ArrayBuffer body (captured in onRequest) survives the retry,
    // so non-idempotent POST/PUT/PATCH requests replay with their body intact.
    const init: RequestInit = {
      method: request.method,
      headers: request.headers,
      signal: request.signal,
    };
    if (buffered) {
      init.body = await buffered;
    }
    const retried = new Request(request.url, init);
    retried.headers.set('Authorization', `Bearer ${(await tokenStorage.getAccess()) ?? ''}`);
    retried.headers.set(RETRY_HEADER, '1');
    const retryResponse = await fetchApi(retried);
    if (retryResponse.status === 401) return await bail(retryResponse);
    return retryResponse;
  },
};

export const api = createClient<paths>({
  baseUrl: env.apiUrl,
  // Resolve fetch lazily so MSW (dev mocks and tests) can patch it after this module loads.
  fetch: (input) => fetchApi(input),
});
api.use(captchaMiddleware, authMiddleware);

export function resetPendingBodies(): void {
  pendingBodies.clear();
}

/** Test-only inspector for the pendingBodies map size (leak-detection asserts). */
export function pendingBodiesSizeForTests(): number {
  return pendingBodies.size;
}

export function toApiError(error: unknown): ApiError {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    typeof (error as ApiError).code === 'string'
  ) {
    const apiError = error as ApiError;
    return { ...apiError, message: localizedErrorMessage(apiError.code, apiError.details) };
  }
  return { code: 'network_error', message: 'Не удалось связаться с сервером' };
}

/** Seconds to wait before retrying a code send, from a 429 rate_limited error
 *  body ({details: {retry_after_seconds}} mirrors the Retry-After header).
 *  Null for any other error. */
export function retryAfterSeconds(error: unknown): number | null {
  const apiError = toApiError(error);
  if (apiError.code !== 'rate_limited') {
    return null;
  }
  const details = apiError.details as { retry_after_seconds?: number } | null | undefined;
  return typeof details?.retry_after_seconds === 'number' ? details.retry_after_seconds : null;
}
