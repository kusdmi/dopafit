import { useToast } from '@/shared/ui/primitives';
import { useEffect, useRef, useState } from 'react';

import { useDeleteMeasurementPhoto } from '@/entities/measurement/api/use-delete-measurement-photo';
import { subscribePhotoUploadRejection } from '@/entities/measurement/api/use-photo-upload';
import { PrivatePhoto } from '@/entities/measurement/ui/PrivatePhoto';
import type { PhotoKind } from '@/entities/measurement/model/fields';
import { PHOTO_KINDS, PHOTO_LABELS } from '@/entities/measurement/model/fields';
import {
  dequeueForMeasurement,
  enqueuePhoto,
  listPendingPhotos,
} from '@/shared/lib/offline/photo-queue';
import { pickPhoto } from '@/shared/lib/platform/camera/pick-photo';
import { cameraOutline } from '@/shared/ui/icons';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { Icon } from '@/shared/ui/primitives';

interface Props {
  measurementId: string;
  // Photos already stored on the server; the URL points to the authenticated API.
  serverPhotos?: { kind: PhotoKind; url: string }[];
}

export function PhotoPicker({ measurementId, serverPhotos }: Props) {
  // Locally picked files only (object URLs). Server photos are derived at render time.
  const [localUrls, setLocalUrls] = useState<Partial<Record<PhotoKind, string>>>({});
  // Kinds whose server photo the user removed this session, so we hide them
  // optimistically before the cache invalidation reaches the parent.
  const [removedServer, setRemovedServer] = useState<Set<PhotoKind>>(() => new Set());
  const [pendingDelete, setPendingDelete] = useState<PhotoKind | null>(null);
  const localUrlsRef = useRef(localUrls);

  const deletePhoto = useDeleteMeasurementPhoto();
  const [present] = useToast();

  useEffect(() => {
    localUrlsRef.current = localUrls;
  });

  // Revoke any outstanding object URLs on unmount.
  useEffect(
    () => () => {
      Object.values(localUrlsRef.current).forEach((url) => url && URL.revokeObjectURL(url));
    },
    [],
  );

  useEffect(
    () =>
      subscribePhotoUploadRejection(({ measurementClientId, kind, status }) => {
        if (measurementClientId !== measurementId) return;
        void listPendingPhotos()
          .then((pending) => {
            // A newer shot can replace this slot while the rejected upload is in
            // flight; its queued preview must remain visible for the next drain.
            if (
              pending.some(
                (photo) => photo.measurementClientId === measurementId && photo.kind === kind,
              )
            )
              return;
            setLocalUrls((prev) => {
              const old = prev[kind];
              if (old) URL.revokeObjectURL(old);
              const next = { ...prev };
              delete next[kind];
              return next;
            });
            void present({
              role: 'alert',
              message:
                status === 422 || status === 413
                  ? 'Фото отклонено: неверный формат или размер изображения'
                  : 'Фото отклонено: не удалось сохранить изображение',
              duration: 3000,
            });
          })
          .catch(() => {
            // Keep the preview when queue storage is unavailable: a replacement
            // might still be pending, and hiding it would claim it was discarded.
          });
      }),
    [measurementId, present],
  );

  const handlePick = async (kind: PhotoKind) => {
    const blob = await pickPhoto();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    setLocalUrls((prev) => {
      const old = prev[kind];
      if (old) URL.revokeObjectURL(old);
      return { ...prev, [kind]: url };
    });
    // Re-picking after a removal makes the photo visible again.
    setRemovedServer((prev) => {
      if (!prev.has(kind)) return prev;
      const next = new Set(prev);
      next.delete(kind);
      return next;
    });
    await enqueuePhoto({
      measurementClientId: measurementId,
      kind,
      blob,
      contentType: blob.type || 'image/jpeg',
    });
  };

  const serverUrlFor = (kind: PhotoKind): string | undefined =>
    removedServer.has(kind) ? undefined : serverPhotos?.find((p) => p.kind === kind)?.url;

  const confirmDelete = async () => {
    const kind = pendingDelete;
    if (!kind) return;
    const hasServer = (serverPhotos ?? []).some((p) => p.kind === kind);

    // The server DELETE only matters when a server-side photo exists. A 404
    // (unsynced record) is swallowed inside the hook so this resolves cleanly.
    // A real failure (e.g. 500) rejects: in that case nothing was deleted, so we
    // leave both the server preview and the local/queued state untouched and just
    // surface a toast — the user can retry. We always close the dialog so it never
    // hangs without feedback.
    if (hasServer) {
      try {
        await deletePhoto.mutateAsync({ measurementId, kind });
      } catch {
        await present({ message: 'Не удалось удалить фото', duration: 3000 });
        setPendingDelete(null);
        return;
      }
    }

    // Success (or a swallowed 404): drop the queued (offline) photo and the local
    // preview, and hide the server photo optimistically.
    await dequeueForMeasurement(measurementId, kind);

    setLocalUrls((prev) => {
      const old = prev[kind];
      if (old) URL.revokeObjectURL(old);
      const next = { ...prev };
      delete next[kind];
      return next;
    });
    setRemovedServer((prev) => new Set(prev).add(kind));
    setPendingDelete(null);
  };

  return (
    // Figma 757:2333: the four shots form a 2x2 grid of tall outlined tiles —
    // a camera glyph over the label while empty, the picked photo filling the
    // tile once chosen. The tile itself is the picker, so its accessible name
    // still starts with "Выбрать".
    <div className="grid grid-cols-2 gap-x-[30px] gap-y-[15px]">
      {PHOTO_KINDS.map((kind) => {
        const previewUrl = localUrls[kind] ?? serverUrlFor(kind);
        return (
          <div key={kind} className="relative flex flex-col">
            <button
              type="button"
              aria-label={`Выбрать фото: ${PHOTO_LABELS[kind]}`}
              // 132px, а не 195px из макета: четыре пустых слота по 195px заняли
              // бы почти два экрана, и пустое состояние стало бы самым крупным
              // объектом экрана. Пропорция портретного кадра сохраняется, снимок
              // заполняет плитку.
              className="flex h-[132px] w-full cursor-pointer flex-col items-center justify-center gap-1 overflow-hidden rounded-[14px] border border-line px-[22px] py-[10px]"
              onClick={() => void handlePick(kind)}
            >
              {localUrls[kind] ? (
                <img
                  src={localUrls[kind]}
                  alt={PHOTO_LABELS[kind]}
                  className="size-full object-cover"
                />
              ) : previewUrl ? (
                <PrivatePhoto
                  url={previewUrl}
                  alt={PHOTO_LABELS[kind]}
                  className="size-full object-cover"
                />
              ) : (
                <>
                  <Icon icon={cameraOutline} style={{ fontSize: 32 }} className="text-muted" />
                  <span className="text-body-s text-muted">{PHOTO_LABELS[kind]}</span>
                </>
              )}
            </button>
            {previewUrl ? (
              <button
                type="button"
                aria-label={`Удалить фото: ${PHOTO_LABELS[kind]}`}
                className="absolute right-[10px] top-[10px] rounded-[14px] bg-card px-2 py-1 text-caption text-danger"
                onClick={() => setPendingDelete(kind)}
              >
                Удалить
              </button>
            ) : null}
          </div>
        );
      })}

      <ConfirmDialog
        isOpen={pendingDelete !== null}
        title="Удалить фото?"
        confirmLabel="Удалить"
        destructive
        pending={deletePhoto.isPending}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
