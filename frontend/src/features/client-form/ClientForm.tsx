import { z } from 'zod';
import { fieldError } from '@/shared/lib/validation/training';
import { useState } from 'react';

import { useNetworkStatus } from '@/shared/lib/network/useNetworkStatus';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Input';
import { Textarea } from '@/shared/ui/Textarea';

export interface ClientFormValues {
  display_name: string;
  phone: string | null;
  injuries: string | null;
  note: string | null;
}

interface Props {
  initial?: {
    display_name: string;
    phone: string | null;
    injuries?: string | null;
    note?: string | null;
  };
  submitLabel: string;
  pending?: boolean;
  /** When true, general fields (name/phone/injuries) are hidden; only the note editor writes. */
  linked?: boolean;
  /** Single save callback carrying all current field values. */
  onSave: (values: ClientFormValues) => void;
}

export function ClientForm({ initial, submitLabel, pending, linked = false, onSave }: Props) {
  const [displayName, setDisplayName] = useState(initial?.display_name ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [injuries, setInjuries] = useState(initial?.injuries ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const errors = {
    name: linked
      ? undefined
      : fieldError(
          z.string().trim().min(1, 'Укажите имя').max(100, 'Максимум 100 символов'),
          displayName,
        ),
    phone:
      !linked && phone.trim()
        ? fieldError(
            z.string().regex(/^\+\d{10,15}$/, 'Телефон: + и от 10 до 15 цифр'),
            phone.trim(),
          )
        : undefined,
    injuries: linked
      ? undefined
      : fieldError(z.string().max(2000, 'Максимум 2000 символов'), injuries),
    note: fieldError(z.string().max(2000, 'Максимум 2000 символов'), note),
  };
  const { isOffline } = useNetworkStatus();

  return (
    // Все поля формы — один компонент с одной логикой подписи (подпись внутри
    // рамки, над значением) и одной геометрией, включая многострочные.
    <div className="flex flex-col gap-[15px]">
      {!linked && (
        <>
          <Input
            label="Имя клиента"
            error={touched.name ? errors.name : undefined}
            value={displayName}
            onChange={(e) => {
              setTouched((old) => ({ ...old, name: true }));
              setDisplayName(e.target.value);
            }}
          />
          <Input
            label="Телефон"
            error={touched.phone ? errors.phone : undefined}
            value={phone}
            onChange={(e) => {
              setTouched((old) => ({ ...old, phone: true }));
              setPhone(e.target.value);
            }}
          />
          <Textarea
            label="Ограничения по здоровью"
            error={touched.injuries ? errors.injuries : undefined}
            value={injuries}
            onChange={(e) => {
              setTouched((old) => ({ ...old, injuries: true }));
              setInjuries(e.target.value);
            }}
            rows={3}
          />
        </>
      )}

      <Textarea
        label="Примечание тренера"
        error={touched.note ? errors.note : undefined}
        value={note}
        onChange={(e) => {
          setTouched((old) => ({ ...old, note: true }));
          setNote(e.target.value);
        }}
        rows={3}
      />

      <Button
        disabled={isOffline || Object.values(errors).some(Boolean)}
        loading={pending}
        onClick={() =>
          onSave({
            display_name: displayName.trim(),
            phone: phone.trim() || null,
            injuries: injuries.trim() || null,
            note: note.trim() || null,
          })
        }
      >
        {isOffline ? 'Недоступно офлайн' : submitLabel}
      </Button>
    </div>
  );
}
