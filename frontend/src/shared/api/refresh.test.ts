import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { server } from '@/app/mocks/server';
import { env } from '@/shared/config/env';

import { api, resetPendingBodies } from './client';
import { authEvents } from './events';
import { ensureRefreshed, resetRefreshState } from './refresh';
import { tokenStorage } from './tokens';

const base = env.apiUrl;
let refreshCalls = 0;

afterEach(async () => {
  refreshCalls = 0;
  await tokenStorage.clear();
  resetRefreshState();
  resetPendingBodies();
  // MSW lifecycle handled by global shared/test/setup.ts
});

beforeEach(async () => {
  await tokenStorage.set('expired-access', 'good-refresh');
});

describe('silent refresh', () => {
  it('refreshes on 401 then retries the original request', async () => {
    let firstHit = true;
    server.use(
      http.get(`${base}/api/v1/programs`, ({ request }) => {
        const auth = request.headers.get('Authorization');
        if (firstHit && auth === 'Bearer expired-access') {
          firstHit = false;
          return new HttpResponse(null, { status: 401 });
        }
        if (auth === 'Bearer new-access') {
          return HttpResponse.json([{ id: 'p1', name: 'OK' }]);
        }
        return new HttpResponse(null, { status: 401 });
      }),
      http.post(`${base}/api/v1/auth/refresh`, async () => {
        refreshCalls += 1;
        return HttpResponse.json({
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          token_type: 'bearer',
        });
      }),
    );

    const { data, error } = await api.GET('/api/v1/programs');
    expect(error).toBeUndefined();
    expect(data).toEqual([{ id: 'p1', name: 'OK' }]);
    expect(refreshCalls).toBe(1);
    expect(await tokenStorage.getAccess()).toBe('new-access');
  });

  it('emits unauthorized and clears tokens when refresh fails', async () => {
    const onUnauthorized = vi.fn();
    const off = authEvents.on('unauthorized', onUnauthorized);
    server.use(
      http.get(`${base}/api/v1/programs`, () => new HttpResponse(null, { status: 401 })),
      http.post(`${base}/api/v1/auth/refresh`, () => new HttpResponse(null, { status: 401 })),
    );

    await api.GET('/api/v1/programs');
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(await tokenStorage.getAccess()).toBeNull();
    off();
  });

  it('keeps the session on a transient refresh failure (500) and surfaces the error', async () => {
    const onUnauthorized = vi.fn();
    const off = authEvents.on('unauthorized', onUnauthorized);
    server.use(
      http.get(`${base}/api/v1/programs`, () => new HttpResponse(null, { status: 401 })),
      http.post(`${base}/api/v1/auth/refresh`, () => new HttpResponse(null, { status: 500 })),
    );

    const { error } = await api.GET('/api/v1/programs');
    // A flaky refresh endpoint must NOT log the user out.
    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(await tokenStorage.getRefresh()).toBe('good-refresh');
    expect(await tokenStorage.getAccess()).toBe('expired-access');
    // The original request still fails so the caller (TanStack/user) can retry.
    expect(error).toBeDefined();
    off();
  });

  it('logs out on a fatal refresh rejection (403)', async () => {
    const onUnauthorized = vi.fn();
    const off = authEvents.on('unauthorized', onUnauthorized);
    server.use(
      http.get(`${base}/api/v1/programs`, () => new HttpResponse(null, { status: 401 })),
      http.post(`${base}/api/v1/auth/refresh`, () => new HttpResponse(null, { status: 403 })),
    );

    await api.GET('/api/v1/programs');
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(await tokenStorage.getAccess()).toBeNull();
    off();
  });

  it('issues only one refresh for parallel 401s', async () => {
    let hits = 0;
    server.use(
      http.get(`${base}/api/v1/programs`, ({ request }) => {
        const auth = request.headers.get('Authorization');
        if (auth === 'Bearer new-access') return HttpResponse.json([]);
        hits += 1;
        return new HttpResponse(null, { status: 401 });
      }),
      http.post(`${base}/api/v1/auth/refresh`, async () => {
        refreshCalls += 1;
        await new Promise((r) => setTimeout(r, 20));
        return HttpResponse.json({
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          token_type: 'bearer',
        });
      }),
    );

    await Promise.all([api.GET('/api/v1/programs'), api.GET('/api/v1/programs')]);
    expect(refreshCalls).toBe(1);
    expect(hits).toBeGreaterThanOrEqual(2);
  });

  it('drops the rotated pair if the session is cleared mid-refresh (generation bump)', async () => {
    server.use(
      http.post(`${base}/api/v1/auth/refresh`, async () => {
        // Logout lands while the refresh response is still in flight.
        await tokenStorage.clear();
        return HttpResponse.json({
          access_token: 'zombie-access',
          refresh_token: 'zombie-refresh',
          token_type: 'bearer',
        });
      }),
    );

    const outcome = await ensureRefreshed();

    // The rotated pair must NOT resurrect a session the user already left.
    expect(outcome).toBe('fatal');
    expect(await tokenStorage.getAccess()).toBeNull();
    expect(await tokenStorage.getRefresh()).toBeNull();
  });

  it('re-clears if the session is torn down WHILE set() writes the rotated pair (TOCTOU)', async () => {
    // The generation is still equal at the pre-write check, then a logout lands
    // during the await tokenStorage.set() — after the check but before it settles.
    const realSet = tokenStorage.set.bind(tokenStorage);
    const setSpy = vi.spyOn(tokenStorage, 'set').mockImplementation(async (a, r) => {
      await realSet(a, r);
      await tokenStorage.clear(); // logout bumps generation mid-write
    });
    server.use(
      http.post(`${base}/api/v1/auth/refresh`, async () =>
        HttpResponse.json({
          access_token: 'zombie-access',
          refresh_token: 'zombie-refresh',
          token_type: 'bearer',
        }),
      ),
    );

    const outcome = await ensureRefreshed();

    // The post-write generation re-check must catch the mismatch and re-clear.
    expect(outcome).toBe('fatal');
    expect(await tokenStorage.getAccess()).toBeNull();
    expect(await tokenStorage.getRefresh()).toBeNull();
    setSpy.mockRestore();
  });

  it('retries a POST with its body intact after refresh', async () => {
    let firstHit = true;
    let receivedBody: unknown = null;
    server.use(
      http.post(`${base}/api/v1/programs`, async ({ request }) => {
        const auth = request.headers.get('Authorization');
        if (firstHit && auth === 'Bearer expired-access') {
          firstHit = false;
          return new HttpResponse(null, { status: 401 });
        }
        receivedBody = await request.json();
        return HttpResponse.json({ id: 'p1', name: 'OK' }, { status: 201 });
      }),
      http.post(`${base}/api/v1/auth/refresh`, async () => {
        refreshCalls += 1;
        return HttpResponse.json({
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          token_type: 'bearer',
        });
      }),
    );

    const { data } = await api.POST('/api/v1/programs', {
      body: {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Тест',
        kind: 'strength',
        days: [],
      },
    });
    expect(refreshCalls).toBe(1);
    expect((data as { name: string }).name).toBe('OK');
    expect(receivedBody).toMatchObject({ name: 'Тест' });
  });
});
