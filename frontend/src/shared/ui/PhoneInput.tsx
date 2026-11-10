import { useController } from 'react-hook-form';
import type { Control, FieldPath, FieldValues } from 'react-hook-form';

import { formatPhoneIntl, toE164 } from '@/shared/lib/phone';
import { Input } from '@/shared/ui/Input';

interface PhoneInputProps<TValues extends FieldValues> {
  control: Control<TValues>;
  name: FieldPath<TValues>;
  label: string;
  error?: string;
}

/**
 * Поле телефона с универсальной (для всех стран) маской. Через RHF Controller:
 * ПОКАЗЫВАЕТ форматированное «+7 999 000 00 00» (formatPhoneIntl), а в форму
 * кладёт чистый E.164 «+79990000000» (toE164) — валидно для zod ^\+\d{10,15}$
 * и без изменения контракта. Форматируем КАЖДОЕ входящее значение, поэтому маска
 * срабатывает и при ручном вводе, и при autofill (он вставляет value программно).
 */
export function PhoneInput<TValues extends FieldValues>({
  control,
  name,
  label,
  error,
}: PhoneInputProps<TValues>) {
  const { field } = useController({ name, control });

  return (
    <Input
      label={label}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      placeholder="+7 999 000-00-00"
      error={error}
      name={field.name}
      // Показываем форматированную версию хранимого E.164.
      value={formatPhoneIntl(String(field.value ?? ''))}
      onChange={(e) => field.onChange(toE164(e.target.value))}
      onBlur={field.onBlur}
    />
  );
}
