import { SkeletonBlock } from '@/shared/ui/primitives';

interface Props {
  /** Сколько плейсхолдеров stat-карточек показать под графиком. */
  statCount: number;
}

/**
 * Скелетон одного аналитического графика на время первого запроса: блок
 * под LineChart + ряд stat-карточек. Габариты подобраны под реальный контент,
 * чтобы при замене на данные не было layout shift. Показывается через
 * DeferredLoading (порог + fade-in), поэтому на быстром кэше не мигает.
 */
export function ChartSkeleton({ statCount }: Props) {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-2">
      <SkeletonBlock animated style={{ width: '100%', height: 180, borderRadius: 8 }} />
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${statCount}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: statCount }).map((_, i) => (
          <div key={i} className="rounded-lg bg-card-light p-3">
            <SkeletonBlock animated style={{ width: '70%', height: 12 }} />
            <SkeletonBlock animated style={{ width: '50%', height: 18 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
