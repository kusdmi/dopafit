import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/shared/ui/Button';
import { PhoneInput } from '@/shared/ui/PhoneInput';

import { ContactBadge, ErrorText } from './ContactBadge';

// Тот же паттерн, что в контракте (PHONE_PATTERN, backend/src/endpoint.ts):
// E.164 — «+» и 10..15 цифр. Без резолвера форма отправляла любой ввод, сервер
// отвечал 422, а пользователь не видел ничего. PhoneInput кладёт в форму уже
// нормализованный toE164, поэтому валидируется именно то, что уйдёт в API.
const phonePattern = /^\+\d{10,15}$/;
const phoneSchema = z.object({
  phone: z.string().regex(phonePattern, 'Введите телефон в формате +7XXXXXXXXXX'),
});

interface Props {
  phone: string | null | undefined;
  isOnline: boolean;
  verified?: boolean;
  onVerify?: () => void;
  verifyPending?: boolean;
  pending: boolean;
  error: unknown;
  onSave: (phone: string, onSaved: () => void) => void;
  onRemove: () => void;
}

export function PhoneSection({
  phone,
  isOnline,
  pending,
  error,
  onSave,
  onRemove,
  verified = false,
  onVerify,
  verifyPending,
}: Props) {
  const form = useForm<{ phone: string }>({
    defaultValues: { phone: '' },
    resolver: zodResolver(phoneSchema),
  });

  return (
    <section className="flex flex-col gap-4 rounded-[14px] border border-line p-4">
      <div className="min-w-0">
        <p className="text-body-s text-muted">Телефон</p>
        <p className="text-h3 break-all text-content">{phone ?? 'Телефон не указан'}</p>
      </div>
      <ContactBadge verified={verified} />
      {phone && !verified && (
        <Button
          type="button"
          variant="outline"
          disabled={!isOnline || verifyPending}
          onClick={onVerify}
        >
          Подтвердить телефон
        </Button>
      )}
      <form
        className="flex flex-col gap-3"
        onSubmit={form.handleSubmit((values) =>
          onSave(values.phone, () => form.reset({ phone: '' })),
        )}
      >
        <PhoneInput
          control={form.control}
          name="phone"
          label="Телефон"
          error={form.formState.errors.phone?.message}
        />
        {/* Ошибка сервера (например, 422) должна быть видна на экране. */}
        <ErrorText error={error} />
        <div className="flex gap-3">
          {phone && !verified ? (
            <Button
              type="button"
              variant="outline"
              color="danger"
              disabled={!isOnline || pending}
              onClick={onRemove}
            >
              Удалить телефон
            </Button>
          ) : null}
          <Button type="submit" disabled={!isOnline || pending}>
            Сохранить телефон
          </Button>
        </div>
      </form>
    </section>
  );
}
