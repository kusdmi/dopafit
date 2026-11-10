import type { components } from '@/shared/api/schema';

import type { DraftProgram } from './store';

type ProgramCreate = components['schemas']['ProgramCreate'];

export function serializeDraft(draft: DraftProgram): ProgramCreate {
  return {
    id: draft.id,
    name: draft.name.trim(),
    kind: draft.kind,
    days: draft.days.map((d) => ({
      id: d.id,
      name: d.name.trim(),
      position: d.position,
      slots: d.slots.map((s) => ({
        id: s.id,
        position: s.position,
        exercises: s.exercises.map((e) => ({
          id: e.id,
          exercise_id: e.exercise_id,
          custom_name: e.exercise_id ? null : e.custom_name?.trim(),
          sets: e.sets,
          reps: e.reps,
          variant_order: e.variant_order,
        })),
      })),
    })),
  };
}
