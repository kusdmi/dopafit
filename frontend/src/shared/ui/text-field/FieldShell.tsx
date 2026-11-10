import type { ReactNode } from 'react';

interface FieldShellProps {
  /** id поля — связывает <label for> с инпутом. */
  htmlFor?: string;
  errorId?: string;
  label: string;
  error?: string;
  /** Поле ввода (BaseInput). */
  children: ReactNode;
  /** Доп. контрол справа в строке поля (например кнопка-глаз). */
  endSlot?: ReactNode;
  /** Без собственной рамки и боковых отступов (см. .app-field--bare). */
  bare?: boolean;
}

/**
 * Визуальная оболочка поля: своя подпись над полем, рамка, строка с контролом и
 * текст ошибки. Label рендерим собственным <label>: на iOS значение
 * съезжало вниз. Здесь зазор и размер подписи полностью под нашим контролем
 * (см. .app-field в index.css).
 */
export function FieldShell({
  htmlFor,
  errorId,
  label,
  error,
  children,
  endSlot,
  bare,
}: FieldShellProps) {
  const modifiers = [
    error ? 'app-field--error' : '',
    // Узел 392:5047 (поле с иконкой-глазом): правый padding 22px вместо 25px.
    endSlot ? 'app-field--with-icon' : '',
    bare ? 'app-field--bare' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={`app-field${modifiers ? ` ${modifiers}` : ''}`}>
      <label className="app-field__label text-label" htmlFor={htmlFor}>
        {label}
      </label>
      <div className="app-field__control">
        {children}
        {endSlot}
      </div>
      {error ? (
        <p id={errorId} role="alert" className="app-field__error text-caption">
          {error}
        </p>
      ) : null}
    </div>
  );
}
