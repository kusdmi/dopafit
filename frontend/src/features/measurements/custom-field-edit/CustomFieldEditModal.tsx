import { useState } from 'react';

import { useUpsertCustomField } from '@/entities/measurement/api/use-custom-fields';
import { toApiError } from '@/shared/api/client';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Input';
import { Modal } from '@/shared/ui/Modal';
import { Select } from '@/shared/ui/Select';

import {
  DEFAULT_MEASUREMENT_UNIT,
  unitOptions,
} from '@/entities/measurement/model/units';

interface Props {
  slot: number;
  isOpen: boolean;
  initialName?: string;
  initialUnit?: string;
  onClose: () => void;
}

// Contract limit (CustomFieldUpdateRequest): name 1..50. Without a client-side
// check an empty name was sent anyway and the server rejected it with nothing
// rendered, so the modal just sat there.
//
// Единицу проверять больше не нужно: она выбирается из списка и пустой быть не
// может, а каждый вариант укладывается в контрактные 1..10 символов.
const NAME_MAX = 50;

function validate(name: string): { name?: string } {
  const errors: { name?: string } = {};
  const trimmedName = name.trim();
  if (trimmedName.length === 0) errors.name = 'Введите название';
  else if (trimmedName.length > NAME_MAX) errors.name = `Не длиннее ${NAME_MAX} символов`;
  return errors;
}

export function CustomFieldEditModal({
  slot,
  isOpen,
  initialName = '',
  initialUnit = '',
  onClose,
}: Props) {
  const [name, setName] = useState(initialName);
  // Новое поле открывается на «см» — самой частой единице, а не пустым: пустой
  // вариант в списке означал бы состояние, из которого нельзя сохранить.
  const [unit, setUnit] = useState(initialUnit || DEFAULT_MEASUREMENT_UNIT);
  const [errors, setErrors] = useState<{ name?: string }>({});
  const upsert = useUpsertCustomField();

  const options = unitOptions(initialUnit);

  const handleSave = () => {
    const nextErrors = validate(name);
    setErrors(nextErrors);
    if (nextErrors.name) return;
    upsert.mutate({ slot, name: name.trim(), unit }, { onSuccess: onClose });
  };

  const footer = (
    <div className="flex gap-3">
      <Button variant="outline" type="button" onClick={onClose}>
        Отмена
      </Button>
      <Button variant="primary" type="button" loading={upsert.isPending} onClick={handleSave}>
        Сохранить
      </Button>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Настройка поля" footer={footer} variant="popup">
      <div className="flex flex-col gap-3">
        <Input
          label="Название"
          value={name}
          error={errors.name}
          maxLength={NAME_MAX}
          onChange={(e) => setName(e.target.value)}
        />
        <Select label="Единица" value={unit} onChange={(e) => setUnit(e.target.value)}>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
        {upsert.isError ? (
          <p role="alert" className="text-body-s text-danger">
            {toApiError(upsert.error).message}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
