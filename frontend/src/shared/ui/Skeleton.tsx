import { SkeletonBlock } from '@/shared/ui/primitives';

type Variant = 'list' | 'card' | 'form';

interface Props {
  variant: Variant;
  /** Число повторов для list/form (по умолчанию 3). Игнорируется для card. */
  count?: number;
}

// Скелетоны загрузки на токенах темы. SkeletonBlock даёт анимированный
// плейсхолдер; обёртки на bg-card/border-line повторяют карточки 1–4.
export function Skeleton({ variant, count = 3 }: Props) {
  if (variant === 'card') {
    return (
      <div data-skeleton-card role="status" aria-busy="true" className="rounded-lg border border-line bg-card p-3">
        <SkeletonBlock animated style={{ width: '60%', height: 16 }} />
        <SkeletonBlock animated style={{ width: '40%', height: 12 }} />
      </div>
    );
  }

  if (variant === 'form') {
    return (
      <div role="status" aria-busy="true" className="space-y-4">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} data-skeleton-field className="space-y-1">
            <SkeletonBlock animated style={{ width: '30%', height: 12 }} />
            <SkeletonBlock animated style={{ width: '100%', height: 40 }} />
          </div>
        ))}
      </div>
    );
  }

  // list
  return (
    <ul role="status" aria-busy="true" className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <li
          key={i}
          data-skeleton-row
          className="flex items-center gap-3 rounded-lg border border-line bg-card p-3"
        >
          <SkeletonBlock animated style={{ width: 40, height: 40, borderRadius: '9999px' }} />
          <div className="flex-1 space-y-1">
            <SkeletonBlock animated style={{ width: '50%', height: 14 }} />
            <SkeletonBlock animated style={{ width: '30%', height: 12 }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
