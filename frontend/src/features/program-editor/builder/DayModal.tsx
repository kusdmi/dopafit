import { useState } from 'react';

import { containsProfanity } from '@/shared/lib/validation/profanity';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Input';
import { fieldError, trainingNameSchema } from '@/shared/lib/validation/training';
import { Modal } from '@/shared/ui/Modal';

interface Props {
  mode: 'add' | 'edit';
  initialName?: string;
  canAdd: boolean;
  onSubmit: (name: string) => void;
  onClose: () => void;
}

export function DayModal({ mode, initialName = '', canAdd, onSubmit, onClose }: Props) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);

  const [touched, setTouched] = useState(false);
  const nameError = fieldError(trainingNameSchema(100), name);
  const submit = () => {
    if (nameError) {
      setTouched(true);
      return;
    }
    if (!name.trim()) return setError('Укажите название дня');
    if (containsProfanity(name)) return setError('Недопустимое название');
    if (mode === 'add' && !canAdd) return setError('Достигнут лимит дней вашего тарифа');
    onSubmit(name.trim());
  };

  // Figma 903:2151 — «Отмена» нейтральной заливкой, действие — акцентом,
  // обе через общую Button (радиус 14px, высота и тень из дизайн-системы).
  const footer = (
    <div className="flex gap-[15px]">
      <Button variant="primary" className="bg-card-light text-content" onClick={onClose}>
        Отмена
      </Button>
      <Button variant="primary" onClick={submit}>
        {mode === 'add' ? 'Добавить' : 'Сохранить'}
      </Button>
    </div>
  );

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={mode === 'add' ? 'Добавить день' : 'Редактировать день'}
      footer={footer}
      variant="popup"
    >
      <Input
        label="Название дня"
        error={touched ? nameError : undefined}
        onBlur={() => setTouched(true)}
        value={name}
        onChange={(e) => {
          setTouched(true);
          setName(e.target.value);
          setError(null);
        }}
        placeholder="Название дня"
        // Роль H3 (16px): ниже 16px iOS зумит страницу при фокусе поля.
        className="text-h3"
      />
      {error && <p className="mt-1 text-body-s text-danger">{error}</p>}
    </Modal>
  );
}
