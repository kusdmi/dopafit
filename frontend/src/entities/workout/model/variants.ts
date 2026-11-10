import type { LocalSet, WorkoutSlot, WorkoutVariant } from './types';

export function primaryVariantId(slot: WorkoutSlot, sets: LocalSet[] = []): string | undefined {
  if (slot.primaryVariantId) return slot.primaryVariantId;
  const isAlternative = (id: string) => slot.alternatives.some((v) => v.variantId === id);
  if (!isAlternative(slot.variantId)) return slot.variantId;
  return sets.find((set) => set.slotId === slot.slotId && !isAlternative(set.variantId))?.variantId;
}

export function workoutVariants(slot: WorkoutSlot, sets: LocalSet[] = []): WorkoutVariant[] {
  const id = primaryVariantId(slot, sets);
  return [
    ...(id ? [{ variantId: id, name: slot.name, exerciseId: slot.exerciseId }] : []),
    ...slot.alternatives,
  ];
}

export function selectedVariant(slot: WorkoutSlot): WorkoutVariant | undefined {
  return workoutVariants(slot).find((v) => v.variantId === slot.variantId);
}
