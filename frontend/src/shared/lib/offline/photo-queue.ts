import { del as idbDel, get as idbGet } from 'idb-keyval';

import type { PhotoKind } from './photo-kind';
import { persistStorage } from '@/shared/lib/platform/storage/query-cache';
import { safeRandomUUID } from '@/shared/lib/uuid';

const QUEUE_KEY = 'dopafit-photo-queue';
export const PHOTO_QUEUE_STORE_KEY = QUEUE_KEY;

export interface QueuedPhoto {
  id: string;
  measurementClientId: string;
  kind: PhotoKind;
  blob: Blob;
  contentType: string;
}

/**
 * On-disk shape. The queue lives in `persistStorage` (SQLite on native, idb on
 * web) rather than idb-only, because iOS WKWebView periodically evicts
 * IndexedDB — the last offline outbox still on idb would silently lose photos on
 * native while the measurement text (persisted in SQLite) survived. persistStorage
 * is a JSON string store, so the Blob is carried as a base64 data payload.
 */
interface StoredPhoto {
  id: string;
  measurementClientId: string;
  kind: PhotoKind;
  contentType: string;
  base64: string;
}

async function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  // Blob.arrayBuffer() isn't universally available (missing on jsdom's Blob), so
  // route through Response which is present in every target runtime.
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Response(blob).arrayBuffer();
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blobToArrayBuffer(blob);
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBlob(base64: string, contentType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: contentType });
}

/**
 * Legacy shape: the queue used to live directly in idb-keyval under the SAME key,
 * holding `QueuedPhoto[]` (with live Blob objects). We migrate it once into
 * persistStorage so:
 *  - web: pending photos aren't silently dropped (the old structured-clone array
 *    of Blobs is unreadable as the new JSON string);
 *  - native: old records left in WKWebView's IndexedDB — which clearPhotoQueue
 *    could never reach — don't outlive logout and leak a past user's private
 *    photos.
 * Deleting the old key matters more than salvaging it: on any read error we still
 * delete.
 */
interface LegacyPhoto {
  id?: string;
  measurementClientId: string;
  kind: PhotoKind;
  blob: Blob;
  contentType: string;
}

/**
 * A structured-cloned Blob may not pass `instanceof Blob` across realms (jsdom,
 * WKWebView), so detect it structurally by its numeric `size`.
 */
function isBlobLike(v: unknown): v is Blob {
  if (v instanceof Blob) return true;
  return typeof v === 'object' && v !== null && typeof (v as Blob).size === 'number';
}

let migrationDone = false;
let migrationPromise: Promise<void> | null = null;

async function safeIdbDel(): Promise<void> {
  try {
    await idbDel(QUEUE_KEY);
  } catch {
    // ignore — best-effort cleanup
  }
}

async function migrateLegacyQueue(): Promise<void> {
  let legacy: unknown;
  try {
    legacy = await idbGet(QUEUE_KEY);
  } catch {
    // Couldn't read the old key — remove it anyway (privacy over salvage).
    await safeIdbDel();
    return;
  }

  // Nothing there, or it's the NEW format. On web, persistStorage IS idb-keyval
  // under this same key, so a JSON string here is the current queue — leave it
  // untouched and don't delete. Only a structured-clone array is legacy.
  if (!Array.isArray(legacy)) return;
  if (legacy.length === 0) {
    // Empty legacy array: just clear the stale key.
    await safeIdbDel();
    return;
  }

  // Convert legacy Blob records to the base64 StoredPhoto shape. Do this BEFORE
  // touching the store so a conversion throw can't leave data half-written.
  let converted: StoredPhoto[] = [];
  try {
    const out: StoredPhoto[] = [];
    for (const item of legacy as LegacyPhoto[]) {
      if (!item || !isBlobLike(item.blob)) continue;
      out.push({
        id: item.id ?? safeRandomUUID(),
        measurementClientId: item.measurementClientId,
        kind: item.kind,
        contentType: item.contentType,
        base64: await blobToBase64(item.blob),
      });
    }
    converted = out;
  } catch {
    // Corrupt legacy data — drop it (privacy over salvage) and stop.
    await safeIdbDel();
    return;
  }

  // Read the existing new-store contents. On web this reads the SAME idb key as
  // the legacy value (a structured-clone array), which readStoredRaw treats as a
  // cache miss (JSON.parse throws) → []. That's fine: the legacy records are
  // exactly what we're migrating.
  const existing = await readStoredRaw();
  const merged = [
    ...converted.filter(
      (c) =>
        !existing.some(
          (e) => e.measurementClientId === c.measurementClientId && e.kind === c.kind,
        ),
    ),
    ...existing,
  ];

  // Delete the legacy idb key FIRST. On web persistStorage shares this key, so
  // writing after the delete leaves the new JSON in place; deleting after the
  // write would wipe what we just migrated.
  await safeIdbDel();
  await writeStored(merged);
}

async function ensureMigrated(): Promise<void> {
  if (migrationDone) return;
  if (!migrationPromise) {
    migrationPromise = migrateLegacyQueue().finally(() => {
      migrationDone = true;
    });
  }
  await migrationPromise;
}

async function readStoredRaw(): Promise<StoredPhoto[]> {
  const raw = await persistStorage.getItem(QUEUE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as StoredPhoto[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function readStored(): Promise<StoredPhoto[]> {
  await ensureMigrated();
  return readStoredRaw();
}

/** Resets the one-time migration guard so tests can exercise it in isolation. */
export function resetPhotoQueueMigrationForTests(): void {
  migrationDone = false;
  migrationPromise = null;
}

async function writeStored(items: StoredPhoto[]): Promise<void> {
  await persistStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

function toQueued(s: StoredPhoto): QueuedPhoto {
  return {
    id: s.id,
    measurementClientId: s.measurementClientId,
    kind: s.kind,
    contentType: s.contentType,
    blob: base64ToBlob(s.base64, s.contentType),
  };
}

export async function enqueuePhoto(input: Omit<QueuedPhoto, 'id'>): Promise<void> {
  const items = await readStored();
  // One photo per (measurement, kind): replace if present.
  const filtered = items.filter(
    (p) => !(p.measurementClientId === input.measurementClientId && p.kind === input.kind),
  );
  filtered.push({
    id: safeRandomUUID(),
    measurementClientId: input.measurementClientId,
    kind: input.kind,
    contentType: input.contentType,
    base64: await blobToBase64(input.blob),
  });
  await writeStored(filtered);
}

export async function listPendingPhotos(): Promise<QueuedPhoto[]> {
  return (await readStored()).map(toQueued);
}

/**
 * Removes exactly the queue record that was uploaded, keyed by its own id rather
 * than by (measurementClientId, kind). During a slow upload the user can queue a
 * REPLACEMENT photo for the same (client, kind) — enqueuePhoto swaps it in under a
 * fresh id — so dequeuing by (client, kind) would silently drop that replacement
 * without ever sending it. Matching the specific record id leaves the newer,
 * un-uploaded photo queued for the next drain.
 */
export async function dequeueById(id: string): Promise<void> {
  const items = await readStored();
  await writeStored(items.filter((p) => p.id !== id));
}

/**
 * Removes the queued photo for a (measurement, kind) slot. Used when the user
 * removes a not-yet-uploaded photo from the form; the drain loop dequeues by
 * record id instead (see dequeueById).
 */
export async function dequeueForMeasurement(
  measurementClientId: string,
  kind: PhotoKind,
): Promise<void> {
  const items = await readStored();
  await writeStored(
    items.filter((p) => !(p.measurementClientId === measurementClientId && p.kind === kind)),
  );
}

/** Drops every queued photo (all kinds) for a measurement, e.g. when it is deleted. */
export async function dequeueAllForMeasurement(measurementClientId: string): Promise<void> {
  const items = await readStored();
  await writeStored(items.filter((p) => p.measurementClientId !== measurementClientId));
}

export async function clearPhotoQueue(): Promise<void> {
  // Abort any pending migration before clearing. Setting migrationDone=true first
  // prevents ensureMigrated from starting a new migration; then we wait for any
  // already-running migrationPromise so its final writeStored() doesn't resurrect
  // a past user's photos into the freshly-cleared store.
  migrationDone = true;
  if (migrationPromise) await migrationPromise.catch(() => {});

  await persistStorage.removeItem(QUEUE_KEY);
  // Belt-and-suspenders for privacy: also drop any legacy idb-keyval value the
  // migration may not have reached yet (e.g. logout before the queue was first
  // read), so a past user's private photos can't survive on native.
  try {
    await idbDel(QUEUE_KEY);
  } catch {
    // ignore
  }
}
