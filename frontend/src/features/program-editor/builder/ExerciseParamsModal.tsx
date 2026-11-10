import { useState } from 'react';

import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Input';
import {
  exerciseParamsSchema,
  fieldError,
  setsSchema,
  repsSchema,
} from '@/shared/lib/validation/training';
import { Modal } from '@/shared/ui/Modal';

import { useBuilderErrors } from './model/validation';
import type { DraftSlotExercise } from './model/store';

interface Props {
  exercise: DraftSlotExercise;
  onSubmit: (values: Pick<DraftSlotExercise, 'sets' | 'reps'>) => void;
  onClose: () => void;
}

export function ExerciseParamsModal({ exercise, onSubmit, onClose }: Props) {
  const serverErrors = useBuilderErrors();
  const [sets, setSets] = useState(String(exercise.sets));
  const [reps, setReps] = useState(String(exercise.reps));
  const parsedSets = Number(sets);
  const parsedReps = Number(reps);
  const valid = exerciseParamsSchema.safeParse({ sets, reps }).success;

  return (
    <Modal
      isOpen
      title="Изменить параметры"
      onClose={onClose}
      footer={
        <div className="flex gap-[15px]">
          <Button variant="primary" className="bg-card-light text-content" onClick={onClose}>
            Отмена
          </Button>
          <Button
            variant="primary"
            disabled={!valid}
            onClick={() => onSubmit({ sets: parsedSets, reps: parsedReps })}
          >
            Сохранить
          </Button>
        </div>
      }
    >
      <p className="text-body-m text-content">{exercise.name}</p>
      <div className="mt-3 grid grid-cols-2 gap-[15px]">
        <Input
          label="Подходы"
          error={
            fieldError(setsSchema, sets) ??
            (sets === String(exercise.sets) ? serverErrors[`${exercise.id}:sets`] : undefined)
          }
          type="number"
          min={1}
          max={99}
          step={1}
          value={sets}
          onChange={(event) => setSets(event.target.value)}
          placeholder="Подходы"
          className="text-h3"
        />
        <Input
          label="Повторения"
          error={
            fieldError(repsSchema, reps) ??
            (reps === String(exercise.reps) ? serverErrors[`${exercise.id}:reps`] : undefined)
          }
          type="number"
          min={1}
          max={999}
          step={1}
          value={reps}
          onChange={(event) => setReps(event.target.value)}
          placeholder="Повторения"
          className="text-h3"
        />
      </div>
    </Modal>
  );
}
