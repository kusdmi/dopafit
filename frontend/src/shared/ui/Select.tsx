import { Icon } from '@/shared/ui/primitives';
import { chevronDown } from '@/shared/ui/icons';
import type { ReactNode, SelectHTMLAttributes } from 'react';

import { fieldGeometry } from './field';

// Единый select в общем дизайн-коде. Под капотом — нативный <select> (доступность
// по роли combobox, нативный мобильный пикер сохранены), но системная стрелка
// убрана через appearance-none и заменена кастомной иконкой chevronDown справа.
//
// Визуально совпадает с фасадом Input (shared/ui/Input.tsx): общая геометрия из
// `fieldGeometry` и — когда передан проп `label` — встроенный stacked-label
// мелким серым шрифтом сверху внутри рамки, как у IonInput
// labelPlacement="stacked". Без `label` (analytics, TargetSwitch — там подпись
// через aria-label/контекст) рисуется только select.
//
// Только семантические токены тем (bg-card / text-content / text-muted).
interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  children: ReactNode;
  label?: string;
}

export function Select({ className, children, label, ...rest }: SelectProps) {
  // <label>, оборачивающий текст подписи и сам <select>, связывает их нативно —
  // getByLabelText('Пол') и роль combobox продолжают работать без htmlFor/id.
  const chevron = (
    <Icon
      icon={chevronDown}
      aria-hidden="true"
      className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted"
    />
  );

  if (label) {
    return (
      <label
        className={`relative flex flex-col justify-center bg-transparent px-[22px] py-[10px] ${fieldGeometry} ${className ?? ''}`}
      >
        <span className="pointer-events-none text-label text-muted">{label}</span>
        <select
          {...rest}
          className="text-h3 w-full appearance-none bg-transparent pr-7 text-content focus:outline-none disabled:opacity-60"
        >
          {children}
        </select>
        {chevron}
      </label>
    );
  }

  return (
    <div className={`relative ${className ?? ''}`}>
      <select
        {...rest}
        className={`text-h3 w-full appearance-none bg-card pl-4 pr-9 text-content focus:border-brand-400 focus:outline-none disabled:opacity-60 ${fieldGeometry}`}
      >
        {children}
      </select>
      {chevron}
    </div>
  );
}
