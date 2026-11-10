import 'fake-indexeddb/auto';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { server } from '@/app/mocks/server';
import type { components } from '@/shared/api/schema';
import { env } from '@/shared/config/env';
import { clearPhotoQueue, enqueuePhoto, listPendingPhotos } from '@/shared/lib/offline/photo-queue';
import { http, HttpResponse } from 'msw';

import { measurementsListKey } from './use-measurements';
import { useDrainPhotoQueueOnline } from './use-drain-photo-queue';

type MeasurementOut = components['schemas']['MeasurementOut'];

function syncedRecord(id: string): MeasurementOut {
  return {
    id,
    date: '2026-06-13',
    updated_at: new Date().toISOString(),
    photos: [],
  } as unknown as MeasurementOut;
}

function Harness() {
  useDrainPhotoQueueOnline();
  return null;
}

function renderWith(qc: QueryClient) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return render(<Harness />, { wrapper });
}

describe('useDrainPhotoQueueOnline', () => {
  beforeEach(async () => {
    await clearPhotoQueue();
  });
  afterEach(async () => {
    await clearPhotoQueue();
  });

  it('uploads queued photos for synced cache records on the online event', async () => {
    const postedTo: string[] = [];
    server.use(
      http.post(`${env.apiUrl}/api/v1/measurements/:id/photos`, async ({ params, request }) => {
        const raw = await request.text();
        const kind = /name="kind"\r?\n\r?\n([^\r\n]+)/.exec(raw)?.[1] ?? '';
        postedTo.push(String(params.id));
        return HttpResponse.json(
          { kind, url: `https://mock-s3.local/get/measurements/${params.id}/${kind}.jpg` },
          { status: 201 },
        );
      }),
    );

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // 'm1' is synced (no __pendingSync); queued photo's clientId resolves to itself.
    qc.setQueryData(measurementsListKey, { items: [syncedRecord('m1')], total: 1 });

    await enqueuePhoto({
      measurementClientId: 'm1',
      kind: 'front',
      blob: new Blob(['x'], { type: 'image/jpeg' }),
      contentType: 'image/jpeg',
    });

    renderWith(qc);

    window.dispatchEvent(new Event('online'));

    await waitFor(async () => {
      expect(postedTo).toContain('m1');
      expect(await listPendingPhotos()).toHaveLength(0);
    });
  });

  it('drains on mount when already online (no online event fired)', async () => {
    const postedTo: string[] = [];
    server.use(
      http.post(`${env.apiUrl}/api/v1/measurements/:id/photos`, async ({ params, request }) => {
        const raw = await request.text();
        const kind = /name="kind"\r?\n\r?\n([^\r\n]+)/.exec(raw)?.[1] ?? '';
        postedTo.push(String(params.id));
        return HttpResponse.json(
          { kind, url: `https://mock-s3.local/get/measurements/${params.id}/${kind}.jpg` },
          { status: 201 },
        );
      }),
    );

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(measurementsListKey, { items: [syncedRecord('m1')], total: 1 });

    await enqueuePhoto({
      measurementClientId: 'm1',
      kind: 'front',
      blob: new Blob(['x'], { type: 'image/jpeg' }),
      contentType: 'image/jpeg',
    });

    // No window 'online' event — the "shot offline, relaunched online" case.
    renderWith(qc);

    await waitFor(async () => {
      expect(postedTo).toContain('m1');
      expect(await listPendingPhotos()).toHaveLength(0);
    });
  });

  it('invalidates the measurements list once a queued photo uploads', async () => {
    server.use(
      http.post(`${env.apiUrl}/api/v1/measurements/:id/photos`, async ({ params, request }) => {
        const raw = await request.text();
        const kind = /name="kind"\r?\n\r?\n([^\r\n]+)/.exec(raw)?.[1] ?? '';
        return HttpResponse.json(
          { kind, url: `https://mock-s3.local/get/measurements/${params.id}/${kind}.jpg` },
          { status: 201 },
        );
      }),
    );

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(measurementsListKey, { items: [syncedRecord('m1')], total: 1 });
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    await enqueuePhoto({
      measurementClientId: 'm1',
      kind: 'front',
      blob: new Blob(['x'], { type: 'image/jpeg' }),
      contentType: 'image/jpeg',
    });

    renderWith(qc);
    window.dispatchEvent(new Event('online'));

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: measurementsListKey });
    });
  });

  it('does not invalidate the list when no queued photo uploads', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // Record is pending sync → resolver returns undefined → nothing uploads.
    qc.setQueryData(measurementsListKey, {
      items: [{ ...syncedRecord('m3'), __pendingSync: true } as unknown as MeasurementOut],
      total: 1,
    });
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    await enqueuePhoto({
      measurementClientId: 'm3',
      kind: 'back',
      blob: new Blob(['z'], { type: 'image/jpeg' }),
      contentType: 'image/jpeg',
    });

    renderWith(qc);
    window.dispatchEvent(new Event('online'));

    await new Promise((r) => setTimeout(r, 20));
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: measurementsListKey });
  });

  it('leaves photos queued when the cached record is still pending sync', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(measurementsListKey, {
      items: [{ ...syncedRecord('m2'), __pendingSync: true } as unknown as MeasurementOut],
      total: 1,
    });

    await enqueuePhoto({
      measurementClientId: 'm2',
      kind: 'back',
      blob: new Blob(['y'], { type: 'image/jpeg' }),
      contentType: 'image/jpeg',
    });

    renderWith(qc);
    window.dispatchEvent(new Event('online'));

    // Give the drain a tick; the photo must remain queued (measurement not synced).
    await new Promise((r) => setTimeout(r, 20));
    expect((await listPendingPhotos()).map((p) => p.measurementClientId)).toEqual(['m2']);
  });
});
