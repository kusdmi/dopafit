import { afterEach, expect, it, vi } from 'vitest';
import { apiNetworkEvents } from './events';
import { fetchApi } from './network-fetch';

afterEach(() => vi.unstubAllGlobals());

it('distinguishes transport failure from an HTTP response', async () => {
  const changed = vi.fn();
  const stop = apiNetworkEvents.on(changed);
  const error = new TypeError('network down');
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(error));
  await expect(fetchApi('http://localhost/api/v1/programs')).rejects.toBe(error);
  expect(changed).toHaveBeenCalledTimes(1);
  const unavailable = new Response(null, { status: 503 });
  vi.mocked(fetch).mockResolvedValue(unavailable);
  await expect(fetchApi('http://localhost/api/v1/programs')).resolves.toBe(unavailable);
  expect(changed.mock.calls.map((call) => call[0])).toEqual(['failure', 'reachable']);
  stop();
});

it('does not treat validation, authentication, quota errors or cancellation as network loss', async () => {
  const changed = vi.fn();
  const stop = apiNetworkEvents.on(changed);
  vi.stubGlobal('fetch', vi.fn());
  for (const status of [200, 401, 403, 422, 429]) {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status }));
    await fetchApi('http://localhost/api/v1/programs');
  }
  const controller = new AbortController();
  controller.abort();
  vi.mocked(fetch).mockRejectedValue(new DOMException('cancelled', 'AbortError'));
  await expect(
    fetchApi(new Request('http://localhost/api/v1/programs', { signal: controller.signal })),
  ).rejects.toBeInstanceOf(DOMException);
  vi.mocked(fetch).mockRejectedValue({ name: 'AbortError' });
  await expect(fetchApi('http://localhost/api/v1/programs')).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(changed).toHaveBeenCalledTimes(5);
  expect(changed.mock.calls.every((call) => call[0] === 'reachable')).toBe(true);
  stop();
});
