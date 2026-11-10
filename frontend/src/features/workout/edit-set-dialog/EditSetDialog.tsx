import { formatDateTime } from '@/shared/lib/time/formatDate';
import { fieldError, weightSchema, repsSchema } from '@/shared/lib/validation/training';
import { useState } from 'react';

import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Input';
import { Modal } from '@/shared/ui/Modal';

interface EditSetInitial {
  weight: number;
  reps: number;
  performedAt: string;
}

interface EditSetDialogProps {
  isOpen: boolean;
  initial: EditSetInitial | null;
  onSave: (patch: { weight: number; reps: number }) => void;
  onDelete: () => void;
  onClose: () => void;
}

function EditSetForm({
  isOpen,
  initial,
  onSave,
  onDelete,
  onClose,
}: {
  isOpen: boolean;
  initial: EditSetInitial;
  onSave: (patch: { weight: number; reps: number }) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [weight, setWeight] = useState(String(initial.weight));
  const [reps, setReps] = useState(String(initial.reps));

  const parsedWeight = weightSchema.safeParse(weight);
  const parsedReps = repsSchema.safeParse(reps);
  const weightNum = parsedWeight.success ? parsedWeight.data : NaN;
  const repsNum = parsedReps.success ? parsedReps.data : NaN;
  const canSave = parsedWeight.success && parsedReps.success;

  const handleSave = () => {
    if (!canSave) return;
    onSave({ weight: weightNum, reps: repsNum });
  };

  const footer = (
    <div className="flex flex-col gap-2">
      <Button variant="primary" type="button" disabled={!canSave} onClick={handleSave}>
        Сохранить
      </Button>
      <Button variant="outline" type="button" onClick={onDelete}>
        Удалить
      </Button>
      <Button variant="ghost" type="button" onClick={onClose}>
        Отмена
      </Button>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Изменить подход"
      footer={footer}
      variant="popup"
    >
      <div className="text-content">
        <p className="mb-4 text-caption text-muted">
          {formatDateTime(initial.performedAt)}
        </p>
        <div className="flex flex-col gap-3">
          <Input
            label="КГ"
            type="text"
            inputMode="decimal"
            error={fieldError(weightSchema, weight)}
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
          />
          <Input
            label="Повторы"
            error={fieldError(repsSchema, reps)}
            type="number"
            inputMode="numeric"
            value={reps}
            onChange={(e) => setReps(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  );
}

export function EditSetDialog({ isOpen, initial, onSave, onDelete, onClose }: EditSetDialogProps) {
  if (!initial) {
    // Render a closed modal shell so the dialog can animate out cleanly.
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Изменить подход" variant="popup">
        {null}
      </Modal>
    );
  }
  // Key by performedAt so the form re-initialises when a different set is edited.
  return (
    <EditSetForm
      key={initial.performedAt}
      isOpen={isOpen}
      initial={initial}
      onSave={onSave}
      onDelete={onDelete}
      onClose={onClose}
    />
  );
}
