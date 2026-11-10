import { ActionButton, Spinner } from '@/shared/ui/primitives';
import type { ComponentProps, ReactNode } from 'react';

type Variant = 'primary' | 'outline' | 'ghost';

interface ButtonProps extends Omit<ComponentProps<typeof ActionButton>, 'fill' | 'expand'> {
  variant?: Variant;
  loading?: boolean;
  /** Ширина кнопки. По умолчанию 'block' (на всю ширину). Передай 'content',
   *  чтобы кнопка сжалась по тексту (напр. ссылочная кнопка). */
  width?: 'block' | 'content';
  children: ReactNode;
}

const fillByVariant: Record<Variant, ComponentProps<typeof ActionButton>['fill']> = {
  primary: 'solid',
  outline: 'outline',
  ghost: 'clear',
};

// Figma CTA pill (nodes 392:5024 primary / 392:5031 outline): 42px tall,
// 10px/20px padding, 14px radius, H3 (16px SemiBold) type — already applied
// by ActionButton for non-clear fills. `ghost` stays a plain inline text
// action, so it keeps ActionButton's default shape.
//
// Neither filled variant carries a shadow by default. A shadow encodes height
// above the screen (design-system.md "Тени"), and most buttons here sit INSIDE
// a card, in the flow — a shadow there is decoration. A screen's one floating
// primary action opts in with `shadow-raised` at the call site.
//
// No `!important` needed here: index.css's `.action-button`/
// `.action-button--outline` rules live in `@layer components`, which sits
// below Tailwind's `@layer utilities` — layered CSS is ranked by layer order
// regardless of source position, so these plain utility classes correctly
// outrank the component class without help.
//
// `min-h-[42px]` (not `h-[42px]`) is deliberate: it raises the floor to Figma's
// 42px without a fixed `height` that would fight a consumer's own override —
// SetLogger.tsx stretches its submit button to the height of the fields beside
// it (`h-auto min-h-0 self-stretch`), and that must still win. A consumer
// overriding the height should override `px-5` too: this padding is
// proportioned for 42px.
const shapeByVariant: Record<Variant, string> = {
  primary: 'min-h-[42px] rounded-[14px] px-5 py-[10px]',
  outline: 'min-h-[42px] rounded-[14px] px-5 py-[10px] border-2',
  ghost: '',
};

export function Button({
  variant = 'primary',
  loading = false,
  disabled,
  width = 'block',
  className,
  children,
  ...rest
}: ButtonProps) {
  // width='block' → ActionButton expand="block" (на всю ширину). width='content' →
  // expand не задаём (кнопка по тексту) + self-center снимает stretch flex-колонки,
  // иначе host всё равно растянулся бы. Решение через width, без привязки к variant.
  const expand = width === 'block' ? 'block' : undefined;
  const mergedClassName =
    [
      shapeByVariant[variant],
      width === 'content' ? 'self-center' : undefined,
      className,
    ]
      .filter(Boolean)
      .join(' ') || undefined;
  return (
    <ActionButton
      expand={expand}
      fill={fillByVariant[variant]}
      disabled={disabled || loading}
      className={mergedClassName}
      {...rest}
    >
      {loading ? <Spinner name="dots" /> : children}
    </ActionButton>
  );
}
