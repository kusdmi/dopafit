import type { CSSProperties, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

import { chevronDown } from '@/shared/ui/icons';
import { Icon } from '@/shared/ui/primitives';

interface Props {
  title: string;
  value: ReactNode;
  hint?: string;
  /** CSS color value (hex, var(--color-*), etc.) driving the border + icon-pill tint. */
  accentColor?: string;
  /**
   * Glyph shown on the alpha-tinted pill (Figma's "colored card" pattern —
   * nodes 392:2071 / 392:2079). Optional: without it the card keeps the
   * compact legend layout used by the analytics chart headers.
   */
  icon?: LucideIcon;
  /** Opens a picker; renders the chevron beside the icon pill (Figma 392:2083). */
  onPick?: () => void;
  pickLabel?: string;
}

// Colored stat card (design-system.md "Цветная карточка"): 1px border in the
// role color + an icon pill tinted at 15% alpha of that same color. The alpha
// is computed with color-mix so no hex/rgba literal is hardcoded here — the
// role color is the only input, and it can be any CSS color value (a var()
// alias or a raw hex from the caller).
export function StatCard({ title, value, hint, accentColor, icon, onPick, pickLabel }: Props) {
  // `rounded-card` is kept as a class (semantic + a stable selector hook used
  // by HomePage.test.tsx) but the design-system radius for this card pattern
  // is 15px, not the 16px --radius-card token — set as an inline override
  // (wins the cascade regardless of utility source order) rather than forking
  // the shared @theme value, which belongs to another agent's zone.
  const style: CSSProperties = {
    borderRadius: 15,
    ...(accentColor
      ? {
          borderColor: accentColor,
          // Exposed as a custom property so the icon pill below can read it
          // without a second inline style block per branch.
          ['--stat-card-accent' as string]: accentColor,
        }
      : undefined),
  };

  if (icon) {
    // Подложка под значком — плашка во всю ширину, высотой 60px и радиусом
    // 25px (design-system.md «Цветная карточка», узлы 392:2071 / 392:2079).
    const pill = (
      <div
        className="flex h-[60px] flex-1 items-center justify-center rounded-[25px]"
        style={
          accentColor
            ? { background: 'color-mix(in srgb, var(--stat-card-accent) 15%, transparent)' }
            : undefined
        }
      >
        <Icon icon={icon} style={{ fontSize: 24 }} />
      </div>
    );

    return (
      // Одна рамка на карточку: сама плашка значка заливки без обводки, так что
      // второго уровня рамок не возникает.
      <div
        className={`rounded-card relative flex flex-1 flex-col gap-[10px] px-[15px] py-[10px] ${
          accentColor ? 'border' : 'border border-line bg-card'
        }`}
        style={style}
      >
        {/* Чеврон стоит РЯДОМ с плашкой, а не внутри неё (узел 392:2083).
            Нажимается при этом ВСЯ карточка, а не только эта строка: кнопка
            растягивает псевдоэлемент `after` на весь родитель (он `relative`),
            поэтому подпись и значение под плашкой тоже попадают в цель. Так
            область нажатия совпадает с видимой карточкой, и пользователю не
            нужно целиться в чеврон.

            Именно псевдоэлемент, а не обёртка всей карточки в <button>:
            значение внутри — крупный текст, который пользователь может хотеть
            выделить, а вложенных интерактивных элементов кнопка не допускает.
            `after` лежит поверх, но сам не рисуется. */}
        {onPick ? (
          <button
            type="button"
            onClick={onPick}
            aria-label={pickLabel}
            className="flex w-full items-center gap-[10px] after:absolute after:inset-0 after:rounded-[15px] after:content-['']"
          >
            {pill}
            <Icon icon={chevronDown} className="shrink-0 text-content" style={{ fontSize: 24 }} />
          </button>
        ) : (
          <div className="flex w-full items-center">{pill}</div>
        )}
        {/* Подпись и значение стоят в ОДНОЙ строке, разнесённые по краям
            (392:2075 / 392:2086), а хинт — отдельной строкой под ними. Значение
            держит text-h1 (22/700) как в макете.

            Заголовок — имя упражнения из личного рекорда, то есть
            пользовательский ввод произвольной длины, поэтому он усекается, а
            значение не сжимается. */}
        <div className="flex flex-col">
          <div className="flex items-center justify-between gap-2">
            <span className="text-body-m min-w-0 truncate text-content">{title}</span>
            <span className="text-h1 shrink-0 text-content">{value}</span>
          </div>
          {hint && <span className="text-caption text-muted">{hint}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-card p-3 ${accentColor ? 'border' : 'bg-card'}`} style={style}>
      <div className="flex items-center justify-between">
        <span className="text-caption text-muted leading-tight">{title}</span>
        {onPick && (
          <button type="button" onClick={onPick} className="text-body-s text-brand-text">
            Сменить
          </button>
        )}
      </div>
      <div
        className="mt-1 text-h2 text-content"
        style={accentColor ? { color: accentColor } : undefined}
      >
        {value}
      </div>
      {hint && <div className="mt-1 text-caption text-muted">{hint}</div>}
    </div>
  );
}
