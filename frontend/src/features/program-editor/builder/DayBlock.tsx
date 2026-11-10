import { PremiumNotice } from '@/shared/ui/PremiumNotice';
import { useSubscriptionStatus } from '@/entities/subscription/api/use-subscription-status';
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useState } from 'react';

import { Button } from '@/shared/ui/Button';
import { chevronDown, pencilOutline, trashOutline } from '@/shared/ui/icons';
import { Icon } from '@/shared/ui/primitives';

import { DayModal } from './DayModal';
import { ExerciseModal } from './ExerciseModal';
import { IconChip } from './IconChip';
import { SlotRow } from './SlotRow';
import { useBuilderStore } from './model/store';
import { useBuilderErrors } from './model/validation';

export function DayBlock({ dayId }: { dayId: string }) {
  const errors = useBuilderErrors();
  const subscription = useSubscriptionStatus();
  const maxExercises = subscription.data?.entitlements?.limits.exercises ?? 10;
  const day = useBuilderStore((s) => s.draft.days.find((d) => d.id === dayId));
  const addExercise = useBuilderStore((s) => s.addExercise);
  const removeDay = useBuilderStore((s) => s.removeDay);
  const renameDay = useBuilderStore((s) => s.renameDay);
  const moveSlot = useBuilderStore((s) => s.moveSlot);
  const [exOpen, setExOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const sensors = useSensors(
    // Touch: require a short press-and-hold before dragging starts. This lets the
    // drag begin from a stationary hold — before any horizontal motion — so
    // activation happens ahead of the browser's edge swipe-back, which needs
    // horizontal movement to trigger. tolerance allows a little finger jitter
    // during the hold without cancelling. (There is no separate app-level
    // swipe-lock mechanism in this codebase — this delay/tolerance pair is the
    // only guard against the native edge-swipe gesture.)
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    // Mouse/desktop: no long-press; start after a small drag distance.
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
  );
  if (!day) return null;

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = day.slots.findIndex((s) => s.id === active.id);
    const to = day.slots.findIndex((s) => s.id === over.id);
    if (from >= 0 && to >= 0) moveSlot(dayId, dayId, from, to);
  };

  return (
    // День — НЕ карточка: заголовок лежит прямо на фоне, а карточками
    // оформлены только слоты под ним.
    <section className="flex flex-col gap-5">
      <header className="flex items-center justify-between">
        <span className="flex items-center gap-[5px] p-[10px]">
          <h3 className="m-0 text-stat-s text-content">{day.name}</h3>
          <Icon icon={chevronDown} className="rotate-180 text-content" style={{ fontSize: 21 }} />
        </span>
        <div className="flex items-center gap-2 px-[10px]">
          <IconChip
            label="Редактировать день"
            icon={pencilOutline}
            onClick={() => setEditOpen(true)}
          />
          <IconChip
            label="Удалить день"
            icon={trashOutline}
            tone="danger"
            onClick={() => removeDay(dayId)}
          />
        </div>
      </header>
      {errors[`${dayId}:name`] && (
        <p role="alert" className="text-body-s text-danger">
          {errors[`${dayId}:name`]}
        </p>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={day.slots.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col gap-5">
            {day.slots.map((s) => (
              <SlotRow
                key={s.id}
                dayId={dayId}
                slotId={s.id}
                label={s.exercises[0]?.name ?? 'Упражнение'}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      <Button
        variant="outline"
        className="border-muted text-body-s text-content"
        disabled={day.slots.length >= maxExercises}
        onClick={() => setExOpen(true)}
      >
        Добавить упражнение
      </Button>
      {day.slots.length >= maxExercises && subscription.data && !subscription.data.is_active && (
        <PremiumNotice
          title="Лимит упражнений"
          description={`В бесплатном доступе до ${maxExercises} упражнений в день. Premium расширяет лимиты.`}
        />
      )}
      {exOpen && (
        <ExerciseModal
          mode="main"
          onClose={() => setExOpen(false)}
          onSubmit={(input) => {
            addExercise(dayId, input);
            setExOpen(false);
          }}
        />
      )}
      {editOpen && (
        <DayModal
          mode="edit"
          initialName={day.name}
          canAdd
          onClose={() => setEditOpen(false)}
          onSubmit={(name) => {
            renameDay(dayId, name);
            setEditOpen(false);
          }}
        />
      )}
    </section>
  );
}
