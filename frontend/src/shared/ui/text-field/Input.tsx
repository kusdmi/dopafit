import { useId, useState } from 'react';

import { BaseInput } from './BaseInput';
import { FieldShell } from './FieldShell';
import { PasswordToggle } from './PasswordToggle';
import type { FieldProps } from './types';

/** Зрительный отступ инпута справа под кнопку-глаз, px (чтобы текст не залезал
 *  под absolute-кнопку; ширина глаза 44 + его боковой отступ). */
const EYE_PADDING = 44;

/**
 * Поле ввода — единый ФАСАД (внешний API один: <Input label type ... />).
 * Внутри тонко делегирует на подкомпоненты, чтобы файл не был перегружен:
 *   FieldShell    — подпись над полем, рамка, текст ошибки;
 *   BaseInput     — чистый IonInput + проброс атрибутов и RHF-мост;
 *   PasswordToggle — кнопка-глаз (только для type="password").
 * Логика пароля (стейт revealed) живёт здесь и не «протекает» в обычные поля.
 */
export function Input({
  label,
  error,
  type,
  hidePasswordToggle = false,
  bare,
  ...rest
}: FieldProps) {
  const inputId = useId();
  const showToggle = type === 'password' && !hidePasswordToggle;
  const [revealed, setRevealed] = useState(false);
  // Для пароля переключаем type локально (password ↔ text) кнопкой-глазом.
  const effectiveType = showToggle && revealed ? 'text' : type;

  return (
    <FieldShell
      htmlFor={inputId}
      errorId={`${inputId}-error`}
      label={label}
      error={error}
      bare={bare}
      endSlot={
        showToggle ? (
          <PasswordToggle revealed={revealed} onToggle={() => setRevealed((v) => !v)} />
        ) : null
      }
    >
      <BaseInput
        id={inputId}
        ariaLabel={label}
        type={effectiveType}
        endPadding={showToggle ? EYE_PADDING : 0}
        {...rest}
        aria-invalid={error ? true : rest['aria-invalid']}
        aria-describedby={
          [rest['aria-describedby'], error ? `${inputId}-error` : null].filter(Boolean).join(' ') ||
          undefined
        }
      />
    </FieldShell>
  );
}
