import { useState } from 'react';
import type { components } from '@/shared/api/schema';

type ExerciseMediaOut = components['schemas']['ExerciseMediaOut'];

interface ExerciseMediaProps {
  media: ExerciseMediaOut[];
  /** Optional fallback: the exercise.image_url, shown when media is empty. */
  imageUrl?: string | null;
}

// Заливка без обводки: медиа всегда лежит внутри обведённой карточки
// («Детали упражнения», карточка упражнения), и собственная рамка давала бы
// рамку внутри рамки. Подложка нужна — она держит поле под object-contain.
const FRAME_CLASS = 'w-full rounded-card bg-card-light';
const MEDIA_CLASS = `${FRAME_CLASS} max-h-80 object-contain`;

function MediaImage({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <p className={`${FRAME_CLASS} p-4 text-center text-body-m text-muted`} role="status">
        Не удалось загрузить медиа
      </p>
    );
  return (
    <img src={url} alt="" loading="lazy" className={MEDIA_CLASS} onError={() => setFailed(true)} />
  );
}

function MediaItem({ item }: { item: ExerciseMediaOut }) {
  switch (item.kind) {
    case 'image':
    case 'gif':
      return <MediaImage key={item.url} url={item.url} />;
    case 'video':
      // No autoplay; user controls playback.
      return <video src={item.url} controls className={MEDIA_CLASS} />;
    case 'iframe':
      // Responsive 16:9 embed. The backend validates the embed URL against an
      // allowlist before storing, so a plain iframe (no sandbox) is safe here.
      return (
        <div
          className="relative w-full overflow-hidden rounded-card bg-card-light"
          style={{ aspectRatio: '16 / 9' }}
        >
          <iframe
            src={item.url}
            className="absolute inset-0 h-full w-full"
            allow="encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="no-referrer"
            title="Видео упражнения"
          />
        </div>
      );
    default:
      // Defensive: unknown kind renders nothing.
      return null;
  }
}

export function ExerciseMedia({ media, imageUrl }: ExerciseMediaProps) {
  const items = [...media].sort((a, b) => a.position - b.position);

  if (items.length === 0) {
    if (imageUrl) {
      return <MediaImage key={imageUrl} url={imageUrl} />;
    }
    return (
      <div
        className={`${FRAME_CLASS} flex aspect-video items-center justify-center text-body-s text-muted`}
        role="img"
        aria-label="Медиа упражнения отсутствует"
      >
        Нет медиа
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((m) => (
        <MediaItem key={m.id} item={m} />
      ))}
    </div>
  );
}
