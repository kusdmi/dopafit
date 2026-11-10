import type { PhotoKind } from '@/entities/measurement/model/fields';
import { tokenStorage } from '@/shared/api/tokens';
import type { components } from '@/shared/api/schema';
import { env } from '@/shared/config/env';
import { dequeueById, listPendingPhotos } from '@/shared/lib/offline/photo-queue';

type MeasurementPhotoOut = components['schemas']['MeasurementPhotoOut'];

interface RejectedPhoto {
  measurementClientId: string;
  kind: PhotoKind;
  status: number;
}

const rejectionListeners = new Set<(photo: RejectedPhoto) => void>();

/** Let the open picker remove a permanently rejected preview immediately. */
export function subscribePhotoUploadRejection(
  listener: (photo: RejectedPhoto) => void,
): () => void {
  rejectionListeners.add(listener);
  return () => rejectionListeners.delete(listener);
}

interface UploadArgs {
  serverMeasurementId: string;
  kind: PhotoKind;
  blob: Blob;
  contentType: string;
}

// Multipart upload bypasses openapi-fetch (it cannot stream a File body cleanly);
// use fetch directly with the bearer token, mirroring uploadExerciseMediaFile.
export async function uploadQueuedPhoto(
  args: UploadArgs,
): Promise<{ kind: PhotoKind; url: string }> {
  const form = new FormData();
  form.append('kind', args.kind);
  // A File preserves the MIME type more reliably than a bare Blob, so the
  // backend's multipart parser gets an explicit content type.
  form.append('file', new File([args.blob], args.kind, { type: args.contentType }));
  const token = await tokenStorage.getAccess();
  const res = await globalThis.fetch(
    `${env.apiUrl}/api/v1/measurements/${args.serverMeasurementId}/photos`,
    {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form,
    },
  );
  if (!res.ok) throw new PhotoUploadError(res.status);
  const data = (await res.json()) as MeasurementPhotoOut;
  return { kind: args.kind, url: data.url };
}

/** Carries the HTTP status so the drain loop can tell permanent from transient. */
export class PhotoUploadError extends Error {
  constructor(readonly status: number) {
    super(`photo upload failed: ${status}`);
    this.name = 'PhotoUploadError';
  }
}

/**
 * 4xx statuses that are permanent for this photo: the request will never succeed
 * on replay (missing measurement, payload too large, unprocessable). 401/408/429
 * are excluded — those are transient (auth refresh / timeout / rate limit).
 */
function isPermanentFailure(status: number): boolean {
  if (status === 401 || status === 408 || status === 429) return false;
  return status >= 400 && status < 500;
}

let draining: Promise<number> | null = null;

/**
 * Drains the photo queue. `resolveServerId` maps a measurement's client id to its
 * server id; photos whose measurement hasn't synced yet are skipped until the next run.
 *
 * Resolves the count of photos successfully uploaded (and dequeued) this run so
 * callers can refresh the measurements list only when something actually changed.
 * A concurrent call returns the in-flight drain's promise (and its count).
 */
export function processPhotoQueue(
  resolveServerId: (clientId: string) => string | undefined,
): Promise<number> {
  if (draining) return draining;
  draining = drainPhotoQueue(resolveServerId).finally(() => {
    draining = null;
  });
  return draining;
}

async function drainPhotoQueue(
  resolveServerId: (clientId: string) => string | undefined,
): Promise<number> {
  const pending = await listPendingPhotos();
  let uploaded = 0;
  for (const photo of pending) {
    const serverId = resolveServerId(photo.measurementClientId);
    if (!serverId) continue; // measurement not synced yet
    try {
      await uploadQueuedPhoto({
        serverMeasurementId: serverId,
        kind: photo.kind,
        blob: photo.blob,
        contentType: photo.contentType,
      });
      // By record id, not by (client, kind) — see dequeueById.
      await dequeueById(photo.id);
      uploaded += 1;
    } catch (err) {
      if (err instanceof PhotoUploadError && isPermanentFailure(err.status)) {
        // Permanent rejection (404/413/422…): retrying forever would churn and
        // keep the user's private blob in storage indefinitely. Drop this exact
        // record (by id) — a replacement queued meanwhile survives.
        await dequeueById(photo.id);
        for (const listener of rejectionListeners) {
          listener({
            measurementClientId: photo.measurementClientId,
            kind: photo.kind,
            status: err.status,
          });
        }
        console.warn('Photo upload permanently failed, dropping', photo.kind, err.status);
        continue;
      }
      // Transient failure: leave this photo queued for the next drain; don't
      // block the others.
      console.warn('Photo upload failed, will retry later', photo.kind, err);
    }
  }
  return uploaded;
}
