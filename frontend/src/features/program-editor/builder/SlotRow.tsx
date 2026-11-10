import { PremiumNotice } from '@/shared/ui/PremiumNotice';
import { useSubscriptionStatus } from '@/entities/subscription/api/use-subscription-status';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useState } from 'react';

import { volumeLabel } from '@/shared/lib/format/plural';
import { Button } from '@/shared/ui/Button';
import { closeOutline, gripVertical, pencilOutline } from '@/shared/ui/icons';
import { Icon } from '@/shared/ui/primitives';

import { ExerciseModal } from './ExerciseModal';
import { ExerciseParamsModal } from './ExerciseParamsModal';
import { IconChip } from './IconChip';
import { useBuilderStore } from './model/store';
import { useBuilderErrors } from './model/validation';

export function SlotRow({
  dayId,
  slotId,
  label,
}: {
  dayId: string;
  slotId: string;
  label: string;
}) {
  const errors = useBuilderErrors();
  const subscription = useSubscriptionStatus();
  const maxAlternatives = subscription.data?.entitlements?.limits.alternatives ?? 5;
  const remove = useBuilderStore((s) => s.removeSlotExercise);
  const slot = useBuilderStore((s) =>
    s.draft.days.find((d) => d.id === dayId)?.slots.find((x) => x.id === slotId),
  );
  const addAlternative = useBuilderStore((s) => s.addAlternative);
  const updateSlotExercise = useBuilderStore((s) => s.updateSlotExercise);
  const [altOpen, setAltOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: slotId,
  });
  // Перетаскиваемая карточка поднимается НАД соседями: z-index, потому что
  // соседи идут позже в потоке и без него перекрывали бы её при наложении, а
  // тень отделяет её от списка, как поднятый со стола лист.
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging ? { zIndex: 1, position: 'relative' as const } : {}),
  };
  if (!slot) return null;
  const editingExercise = slot.exercises.find((exercise) => exercise.id === editingId);

  return (
    // Слот — карточка с подсказкой про перетаскивание, упражнениями и кнопкой
    // добавления альтернативы. Зона захвата — вся карточка (не только узкая
    // подсказка), чтобы попасть пальцем было легче: attributes/listeners висят
    // на <li>, а кнопки внутри (IconChip/Button) остаются обычными тапами,
    // потому что TouchSensor требует 200мс удержания и MouseSensor — 8px
    // смещения мышью, прежде чем drag вообще активируется (см. DayBlock).
    //
    // touch-action: pan-y (не 'none') — тот же приём, что у shared/ui/LineChart:
    // до активации drag'а вертикальный скролл пальцем должен работать как
    // обычно (без 200мс залипания на "пусто"), а once-activated dnd-kit сам
    // вызывает preventDefault на каждый touchmove (AbstractPointerSensor),
    // что перебивает touch-action per-event и останавливает скролл на время
    // реального перетаскивания.
    <li
      ref={setNodeRef}
      style={{ ...style, touchAction: 'pan-y' }}
      {...attributes}
      {...listeners}
      aria-label={`Переместить: ${label}`}
      // bg-card обязателен, а не косметика: карточка слота ПОДНИМАЕТСЯ над
      // списком при перетаскивании, и без собственной заливки сквозь неё
      // просвечивали соседние строки — читалось как наложение двух карточек.
      // В покое заливка тоже уместна: слот — отдельный объект на фоне страницы.
      className={`flex cursor-grab flex-col gap-[15px] rounded-[14px] border border-line bg-card p-[10px] ${
        isDragging ? 'shadow-overlay' : ''
      }`}
    >
      <span className="flex items-center gap-1 px-[5px] text-caption text-muted">
        <Icon icon={gripVertical} style={{ fontSize: 16 }} />
        Перетащите для изменения порядка
      </span>
      {slot.exercises.map((e) => {
        const isAlt = e.variant_order > 0;
        return (
          <div
            key={e.id}
            // Альтернатива уходит за вертикальную полосу цвета серии 4 —
            // тот же приём, что на экранах просмотра программы (932:1988).
            className={`flex items-center justify-between gap-2 ${
              isAlt ? 'border-l border-chart-4-text pl-[10px]' : ''
            }`}
          >
            <span className="flex min-w-0 flex-col">
              <span className="flex items-center gap-[5px]">
                {isAlt && <span className="text-body-m text-chart-4-text">Альт.</span>}
                <span className="truncate text-body-m text-content">{e.name}</span>
              </span>
              <span className="text-caption text-content">{volumeLabel(e.sets, e.reps)}</span>
              {['sets', 'reps', 'custom_name'].map((field) =>
                errors[`${e.id}:${field}`] ? (
                  <span key={field} role="alert" className="text-caption text-danger">
                    {errors[`${e.id}:${field}`]}
                  </span>
                ) : null,
              )}
            </span>
            <span className="flex shrink-0 items-center gap-5">
              <IconChip
                label="Изменить параметры"
                icon={pencilOutline}
                size={24}
                onClick={() => setEditingId(e.id)}
              />
              <IconChip
                label="Удалить упражнение"
                icon={closeOutline}
                size={24}
                tone="danger"
                onClick={() => remove(dayId, slotId, e.id)}
              />
            </span>
          </div>
        );
      })}
      {slot.exercises.length <= maxAlternatives + 1 && (
        <Button
          variant="outline"
          className="border-chart-4-text text-body-s text-content"
          disabled={slot.exercises.length >= maxAlternatives + 1}
          onClick={() => setAltOpen(true)}
        >
          + Добавить альтернативу
        </Button>
      )}
      {slot.exercises.length >= maxAlternatives + 1 &&
        subscription.data &&
        !subscription.data.is_active && (
          <PremiumNotice
            title="Лимит альтернатив"
            description={`В бесплатном доступе до ${maxAlternatives} альтернатив для упражнения. Premium расширяет лимиты.`}
          />
        )}
      {altOpen && (
        <ExerciseModal
          mode="alternative"
          onClose={() => setAltOpen(false)}
          onSubmit={(input) => {
            addAlternative(dayId, slotId, input);
            setAltOpen(false);
          }}
        />
      )}
      {editingExercise && (
        <ExerciseParamsModal
          exercise={editingExercise}
          onClose={() => setEditingId(null)}
          onSubmit={(values) => {
            updateSlotExercise(dayId, slotId, editingExercise.id, values);
            setEditingId(null);
          }}
        />
      )}
    </li>
  );
}
