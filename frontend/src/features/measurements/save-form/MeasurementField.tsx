import { useId, type InputHTMLAttributes, type ReactNode } from 'react';

import { DateInput } from '@/shared/ui/DateInput';
import { fieldGeometry } from '@/shared/ui/field';

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'label'> {
  label: string;
  /** Unit shown inside the field on the right ("кг", "см"). */
  unit?: string;
  error?: string;
  /** Control rendered next to the label (the custom-slot rename pencil). */
  labelAction?: ReactNode;
}

/**
 * Поле замера по макету 757:1991: подпись НАД рамкой, значение слева, единица
 * измерения справа внутри поля.
 *
 * Почему локальный компонент, а не `shared/ui/Input`: фасад Input рисует подпись
 * ВНУТРИ рамки и не имеет слота под суффикс-единицу, а заводить такой слот в
 * общем примитиве ради одного экрана не стоит. Геометрия берётся из общего
 * источника правды `fieldGeometry` — высота 58px, радиус 14px и рамка совпадают
 * с Input/Select, как требует design-system.md.
 */
export function MeasurementField({ label, unit, error, labelAction, ...input }: Props) {
  const id = useId();
  const Control = input.type === 'date' ? DateInput : 'input';
  return (
    <div className="flex min-w-0 flex-col gap-[6px]">
      <div className="flex items-center justify-between gap-2">
        {/* Подпись держится в одну строку: имя кастомного поля (до 50 символов
            по схеме) переносилось на четыре строки и растягивало ячейку, из-за
            чего соседняя колонка грида теряла выравнивание по ряду. */}
        <label htmlFor={id} title={label} className="text-body-s truncate text-content">
          {label}
        </label>
        {labelAction}
      </div>
      <div
        className={`${fieldGeometry} flex items-center px-[22px] py-[10px] ${
          error ? 'border-danger-fill' : ''
        }`}
      >
        {/* Значение и единица — одна группа, прижатая влево, а не значение слева
            и «см» у правого края. Растянутый flex-1 на инпуте уводил единицу в
            противоположный угол поля, и она читалась отдельным элементом, а не
            единицей при числе. Инпут сжимается по содержимому (`size=1` снимает
            дефолтную ширину в 20 символов), поэтому «см» стоит сразу за числом. */}
        {/* Роль H3 (16px), а не Body S, как у подписи над рамкой: ниже 16px
            iOS зумит страницу при фокусе, и на этом экране полей 14 — зум
            срабатывал на каждом. 16px — это и роль значения в поле у фасада
            Input/Select (`.app-field__control input`), так что поля замеров
            теперь совпадают с полями на остальных экранах.

            Ширину это не ломает: инпут сжимается по содержимому (`size={1}`),
            а в колонке грида (2 колонки по ~156px минус padding 44px) даже
            «105.5» с единицей укладывается с запасом. */}
        <Control
          id={id}
          size={1}
          className="text-h3 min-w-0 flex-1 bg-transparent text-content outline-none placeholder:text-muted"
          {...input}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        {unit && (
          <span aria-hidden="true" className="text-body-s ml-1.5 shrink-0 text-muted">
            {unit}
          </span>
        )}
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-caption text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
