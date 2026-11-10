import { HttpResponse, http } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { server } from '@/app/mocks/server';
import { tokenStorage } from '@/shared/api/tokens';
import { env } from '@/shared/config/env';

import { fetchPrivatePhoto } from './fetch-private-photo';

const path = '/api/v1/measurements/m1/photos/front/content';

afterEach(() => vi.restoreAllMocks());

describe('fetchPrivatePhoto', () => {
  it('sends the bearer token only to the private photo endpoint', async () => {
    vi.spyOn(tokenStorage, 'getAccess').mockResolvedValue('owner-token');
    let authorization: string | null = null;
    server.use(
      http.get(`${env.apiUrl}${path}`, ({ request }) => {
        authorization = request.headers.get('Authorization');
        return new HttpResponse(new Uint8Array([1, 2, 3]), {
          headers: { 'Content-Type': 'image/jpeg' },
        });
      }),
    );

    const blob = await fetchPrivatePhoto(path, new AbortController().signal);
    expect(authorization).toBe('Bearer owner-token');
    expect(blob.type).toBe('image/jpeg');
    expect(blob.size).toBe(3);
  });

  it('rejects a storage URL before sending any credential', async () => {
    const access = vi.spyOn(tokenStorage, 'getAccess').mockResolvedValue('owner-token');
    await expect(
      fetchPrivatePhoto('https://storage.example/private.jpg', new AbortController().signal),
    ).rejects.toThrow('Invalid private photo URL');
    expect(access).not.toHaveBeenCalled();
  });

  it('does not turn a 404 into an image', async () => {
    vi.spyOn(tokenStorage, 'getAccess').mockResolvedValue('stranger-token');
    server.use(
      http.get(`${env.apiUrl}${path}`, () =>
        HttpResponse.json({ code: 'not_found', message: 'Photo not found' }, { status: 404 }),
      ),
    );
    await expect(fetchPrivatePhoto(path, new AbortController().signal)).rejects.toThrow(
      'Private photo request failed: 404',
    );
  });
});
