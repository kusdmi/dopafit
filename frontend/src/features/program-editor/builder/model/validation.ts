import { createContext, useContext } from 'react';
import type { DraftProgram } from './store';
import {
  fieldError,
  trainingNameSchema,
  setsSchema,
  repsSchema,
} from '@/shared/lib/validation/training';
export const BuilderErrors = createContext<Record<string, string>>({});
export const useBuilderErrors = () => useContext(BuilderErrors);
export function validateDraft(draft: DraftProgram): Record<string, string> {
  const errors: Record<string, string> = {};
  const check = (id: string, field: string, message: string | undefined) => {
    if (message) errors[`${id}:${field}`] = message;
  };
  check(draft.id, 'name', fieldError(trainingNameSchema(255), draft.name));
  for (const day of draft.days) {
    check(day.id, 'name', fieldError(trainingNameSchema(100), day.name));
    for (const slot of day.slots)
      for (const exercise of slot.exercises) {
        check(exercise.id, 'sets', fieldError(setsSchema, exercise.sets));
        check(exercise.id, 'reps', fieldError(repsSchema, exercise.reps));
        if (!exercise.exercise_id)
          check(
            exercise.id,
            'custom_name',
            fieldError(trainingNameSchema(255), exercise.custom_name),
          );
      }
  }
  return errors;
}
