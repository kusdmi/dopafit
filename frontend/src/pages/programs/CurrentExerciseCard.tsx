import type { WorkoutSlot } from '@/entities/workout/model/types';
import { selectedVariant, workoutVariants } from '@/entities/workout/model/variants';
import { volumeLabel } from '@/shared/lib/format/plural';

interface CurrentExerciseCardProps {
  slot: WorkoutSlot;
  completed: boolean;
  onChooseVariant: (variantId: string) => void;
  onToggleComplete: () => void;
}

export function CurrentExerciseCard({
  slot,
  completed,
  onChooseVariant,
  onToggleComplete,
}: CurrentExerciseCardProps) {
  const variants = workoutVariants(slot);
  return (
    <section
      aria-label="Текущее упражнение"
      className={`flex flex-col gap-[15px] rounded-[14px] border p-[15px] ${completed ? 'border-success' : 'border-brand-400'}`}
    >
      <div className="flex items-start gap-3">
        <label className="flex min-h-[44px] shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg px-1 text-caption text-content focus-within:ring-2 focus-within:ring-brand-400">
          <input
            type="checkbox"
            checked={completed}
            onChange={onToggleComplete}
            className="size-6 cursor-pointer accent-brand-400"
          />
          Выполнено
        </label>
        <span className="flex min-w-0 flex-col gap-1">
          <span className="break-words text-h2 text-content">
            {selectedVariant(slot)?.name ?? slot.name}
          </span>
          <span className="text-caption text-content">{volumeLabel(slot.sets, slot.reps)}</span>
        </span>
      </div>
      {slot.alternatives.length > 0 && (
        <div className="flex flex-col gap-[10px] border-t border-line pt-[15px]">
          <p className="text-caption text-muted">Вариант упражнения</p>
          {!slot.primaryVariantId && (
            <p role="status" className="text-body-s text-muted">
              Основной вариант восстановится, когда станут доступны данные программы. Записанные
              подходы сохранены.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {variants.map((variant) => (
              <button
                key={variant.variantId}
                type="button"
                aria-pressed={variant.variantId === slot.variantId}
                onClick={() => onChooseVariant(variant.variantId)}
                className={`min-h-[44px] rounded-[14px] border px-3 py-2 text-body-s focus-visible:ring-2 focus-visible:ring-brand-400 ${variant.variantId === slot.variantId ? 'border-brand-400 bg-brand-400 text-chart-1-fg' : 'border-line bg-card text-content'}`}
              >
                {variant.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
