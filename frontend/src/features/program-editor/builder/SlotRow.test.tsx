import { DndContext, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { SlotRow } from './SlotRow';
import { useBuilderStore } from './model/store';

const ex = { exercise_id: null, custom_name: 'X', name: 'Присед', sets: 3, reps: 10 };

function setupSlot() {
  useBuilderStore.getState().initEmpty();
  useBuilderStore.getState().addDay('День 1');
  const dayId = useBuilderStore.getState().draft.days[0].id;
  useBuilderStore.getState().addExercise(dayId, ex);
  const slotId = useBuilderStore.getState().draft.days[0].slots[0].id;
  return { dayId, slotId };
}

// SlotRow's useSortable() needs a DndContext/SortableContext ancestor, and
// the "+ Добавить альтернативу" modal it can open queries exercises via
// react-query, so a QueryClientProvider is required too (same as
// ExerciseModal.test.tsx).
//
// Sensors are deliberately the SAME activationConstraint config as DayBlock
// (delay/tolerance for touch, distance for mouse) — dnd-kit's own default
// sensor (bare PointerSensor, no constraint) activates a drag on the very
// first pointerdown, which swallows the following click on any nested
// button. That default is NOT what ships in DayBlock, so testing against it
// would prove nothing about whether real buttons stay clickable.
function Wrapper({ dayId, slotId }: { dayId: string; slotId: string }) {
  const sensors = useSensors(
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
  );
  return (
    <DndContext sensors={sensors}>
      <SortableContext items={[slotId]}>
        <ul>
          <SlotRow dayId={dayId} slotId={slotId} label="Присед" />
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function renderSlot(dayId: string, slotId: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Wrapper dayId={dayId} slotId={slotId} />
    </QueryClientProvider>,
  );
}

describe('SlotRow drag capture area', () => {
  beforeEach(() => useBuilderStore.getState().initEmpty());

  it('removes the exercise on a plain click, not swallowed by the drag capture area', async () => {
    const { dayId, slotId } = setupSlot();
    renderSlot(dayId, slotId);
    await userEvent.click(screen.getByLabelText('Удалить упражнение'));
    expect(useBuilderStore.getState().draft.days[0].slots).toHaveLength(0);
  });

  it('opens the alternative modal on a plain click of "+ Добавить альтернативу"', async () => {
    const { dayId, slotId } = setupSlot();
    renderSlot(dayId, slotId);
    expect(screen.queryByPlaceholderText('Название упражнения')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '+ Добавить альтернативу' }));
    // ExerciseModal renders a name search input once open.
    expect(await screen.findByPlaceholderText('Название упражнения')).toBeInTheDocument();
  });

  it('edits sets and reps without replacing the slot exercise', async () => {
    const { dayId, slotId } = setupSlot();
    const exerciseId = useBuilderStore.getState().draft.days[0].slots[0].exercises[0].id;
    renderSlot(dayId, slotId);

    await userEvent.click(screen.getByRole('button', { name: 'Изменить параметры' }));
    const sets = screen.getByRole('spinbutton', { name: 'Подходы' });
    const reps = screen.getByRole('spinbutton', { name: 'Повторения' });
    expect(sets).toHaveValue(3);
    expect(reps).toHaveValue(10);
    await userEvent.clear(sets);
    await userEvent.type(sets, '6');
    await userEvent.clear(reps);
    await userEvent.type(reps, '11');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    const exercise = useBuilderStore.getState().draft.days[0].slots[0].exercises[0];
    expect(exercise).toMatchObject({ id: exerciseId, sets: 6, reps: 11 });
    expect(screen.getByText('6 подходов × 11 повторений')).toBeInTheDocument();
  });

  it('exposes drag attributes and an aria-label on the whole card, not just the hint text', () => {
    const { dayId, slotId } = setupSlot();
    renderSlot(dayId, slotId);
    const card = screen.getByLabelText('Переместить: Присед');
    // The card itself is the draggable node (dnd-kit sortable attributes),
    // so the whole li — not a narrow inner span — is the capture area.
    expect(card.tagName).toBe('LI');
    expect(card).toHaveAttribute('aria-roledescription', 'sortable');
    expect(card.style.touchAction).toBe('pan-y');
  });

  it('keeps the visual drag hint text for discoverability', () => {
    const { dayId, slotId } = setupSlot();
    renderSlot(dayId, slotId);
    expect(screen.getByText('Перетащите для изменения порядка')).toBeInTheDocument();
  });
});
