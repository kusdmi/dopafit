import 'fake-indexeddb/auto';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { server } from '@/app/mocks/server';
import { env } from '@/shared/config/env';
import { clearPhotoQueue, enqueuePhoto, listPendingPhotos } from '@/shared/lib/offline/photo-queue';

import {
  processPhotoQueue,
  subscribePhotoUploadRejection,
  uploadQueuedPhoto,
} from './use-photo-upload';

describe('uploadQueuedPhoto', () => {
  it('uploads a photo via a single multipart POST against a server measurement id', async () => {
    // Use a non-default kind ('back') so an accidental empty/stub kind on the
    // server side cannot coincidentally satisfy the assertion.
    const result = await uploadQueuedPhoto({
      serverMeasurementId: 'srv-1',
      kind: 'back',
      blob: new Blob(['x'], { type: 'image/jpeg' }),
      contentType: 'image/jpeg',
    });
    expect(result.kind).toBe('back');
    expect(result.url).toContain('srv-1');
    // result.url is built by the mock from the kind it parsed out of the
    // multipart body, so this proves the 'kind' field was serialized into the
    // multipart request and parsed back out server-side (not echoed locally).
    expect(result.url).toContain('back');
  });
});

describe('processPhotoQueue', () => {
  beforeEach(async () => {
    await clearPhotoQueue();
  });

  it('drains queued photos for synced measurements and leaves unsynced ones', async () => {
    await enqueuePhoto({
      measurementClientId: 'synced',
      kind: 'front',
      blob: new Blob(['x'], { type: 'image/jpeg' }),
      contentType: 'image/jpeg',
    });
    await enqueuePhoto({
      measurementClientId: 'unsynced',
      kind: 'back',
      blob: new Blob(['y'], { type: 'image/jpeg' }),
      contentType: 'image/jpeg',
    });

    // resolver maps only 'synced' to a server id; 'unsynced' returns undefined → skipped
    const uploaded = await processPhotoQueue((clientId) =>
      clientId === 'synced' ? 'srv-1' : undefined,
    );

    // One photo actually drained; the count drives the list-refresh in callers.
    expect(uploaded).toBe(1);

    const remaining = await listPendingPhotos();
    expect(remaining.map((p) => p.measurementClientId)).toEqual(['unsynced']);
  });

  it('dequeues a photo that fails permanently (422) instead of retrying forever', async () => {
    const rejected = vi.fn();
    const unsubscribe = subscribePhotoUploadRejection(rejected);
    server.use(
      http.post(
        `${env.apiUrl}/api/v1/measurements/:id/photos`,
        () => new HttpResponse(null, { status: 422 }),
      ),
    );
    await enqueuePhoto({
      measurementClientId: 'synced',
      kind: 'front',
      blob: new Blob(['x'], { type: 'image/jpeg' }),
      contentType: 'image/jpeg',
    });

    const uploaded = await processPhotoQueue(() => 'srv-1');

    // Nothing uploaded, but the doomed photo is dropped from the queue.
    expect(uploaded).toBe(0);
    expect(await listPendingPhotos()).toEqual([]);
    expect(rejected).toHaveBeenCalledWith({
      measurementClientId: 'synced',
      kind: 'front',
      status: 422,
    });
    unsubscribe();
  });

  it('keeps a photo queued on a transient failure (429)', async () => {
    server.use(
      http.post(
        `${env.apiUrl}/api/v1/measurements/:id/photos`,
        () => new HttpResponse(null, { status: 429 }),
      ),
    );
    await enqueuePhoto({
      measurementClientId: 'synced',
      kind: 'front',
      blob: new Blob(['x'], { type: 'image/jpeg' }),
      contentType: 'image/jpeg',
    });

    const uploaded = await processPhotoQueue(() => 'srv-1');

    expect(uploaded).toBe(0);
    expect((await listPendingPhotos()).map((p) => p.measurementClientId)).toEqual(['synced']);
  });

  it('keeps a replacement photo queued when it is enqueued during the old upload', async () => {
    // Gate the upload so we can enqueue a replacement for the SAME (client, kind)
    // while the original is still in flight.
    let releaseUpload!: () => void;
    const uploadGate = new Promise<void>((res) => {
      releaseUpload = res;
    });
    server.use(
      http.post(`${env.apiUrl}/api/v1/measurements/:id/photos`, async () => {
        await uploadGate;
        return HttpResponse.json({ kind: 'front', url: 'https://x/srv-1/front.jpg' });
      }),
    );

    await enqueuePhoto({
      measurementClientId: 'synced',
      kind: 'front',
      blob: new Blob(['old'], { type: 'image/jpeg' }),
      contentType: 'image/jpeg',
    });

    const drain = processPhotoQueue(() => 'srv-1');

    // While the old photo uploads, the user retakes the shot: a replacement for the
    // same slot lands in the queue under a fresh id.
    await enqueuePhoto({
      measurementClientId: 'synced',
      kind: 'front',
      blob: new Blob(['new'], { type: 'image/jpeg' }),
      contentType: 'image/jpeg',
    });

    releaseUpload();
    await drain;

    // The completed upload dequeued only the ORIGINAL record (by id), so the
    // replacement is still queued to be sent on the next drain — not silently lost.
    const remaining = await listPendingPhotos();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].measurementClientId).toBe('synced');
    expect(remaining[0].kind).toBe('front');
  });

  it('resolves 0 when every queued photo is skipped', async () => {
    await enqueuePhoto({
      measurementClientId: 'unsynced',
      kind: 'back',
      blob: new Blob(['y'], { type: 'image/jpeg' }),
      contentType: 'image/jpeg',
    });

    // No measurement resolves to a server id → nothing uploads, nothing dequeues.
    const uploaded = await processPhotoQueue(() => undefined);

    expect(uploaded).toBe(0);
    expect((await listPendingPhotos()).map((p) => p.measurementClientId)).toEqual(['unsynced']);
  });
});
