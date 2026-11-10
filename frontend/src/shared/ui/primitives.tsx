import {
  Children,
  cloneElement,
  isValidElement,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useInRouterContext, useNavigate } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { NavigationContext } from '@/shared/lib/navigation-context';
import { keepFocusedFieldVisible } from '@/shared/lib/platform/keyboard/keyboard';
import { chevronBack } from './icons';

type BoxProps = HTMLAttributes<HTMLDivElement>;
export function AppFrame({ children }: { children: ReactNode }) {
  useEffect(keepFocusedFieldVisible, []);
  return <div className="app-frame">{children}</div>;
}
export function Page({
  className = '',
  background = 'flat',
  ...props
}: BoxProps & { background?: 'flat' | 'gradient' }) {
  // 'flat' is the plain --surface fill from .page (owned elsewhere in
  // index.css). 'gradient' opts a screen into --gradient-bg-primary via the
  // additive .page--gradient modifier — it only sets `background`, so it
  // composes with .page instead of overriding rules that class doesn't touch
  // (border, layout, etc.).
  const backgroundClass = background === 'gradient' ? 'page--gradient' : '';
  return <div className={`page ${backgroundClass} ${className}`} {...props} />;
}
export function PageContent({
  className = '',
  fullscreen: _fullscreen,
  scrollY = true,
  restoreScrollTop,
  ...props
}: BoxProps & { fullscreen?: boolean; scrollY?: boolean; restoreScrollTop?: number }) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (restoreScrollTop !== undefined && ref.current) ref.current.scrollTop = restoreScrollTop;
  }, [restoreScrollTop]);
  // Шапка отделяется от контента ТОЛЬКО когда под неё что-то уехало.
  // Постоянная линия по верху страницы выглядит лишней, когда отделять ещё
  // нечего, а без неё прокрученный контент упирается в шапку и сливается с ней.
  // Флаг ставится на .page — общего предка шапки и контента: правило в
  // index.css само включает границу у .page-header.
  useEffect(() => {
    const element = ref.current;
    if (!element || !scrollY) return;
    const page = element.closest('.page');
    if (!page) return;
    const sync = () => {
      page.toggleAttribute('data-scrolled', element.scrollTop > 0);
    };
    sync();
    element.addEventListener('scroll', sync, { passive: true });
    return () => {
      element.removeEventListener('scroll', sync);
      page.removeAttribute('data-scrolled');
    };
  }, [scrollY]);
  return (
    <main
      ref={ref}
      className={`page-content ${className}`}
      data-scroll-container={scrollY ? '' : undefined}
      {...props}
    />
  );
}
export function PageHeader({
  transparent = false,
  className = '',
  ...props
}: HTMLAttributes<HTMLElement> & { transparent?: boolean }) {
  // The default is an opaque --card plate with a divider. `transparent` opts a
  // screen into the additive .page-header--transparent modifier — it only
  // clears background and border, so it composes with .page-header instead of
  // overriding the layout and safe-area rules that class owns. Used on the
  // gradient auth screens, where Figma shows the chevron and title floating
  // straight on the gradient.
  const transparentClass = transparent ? 'page-header--transparent' : '';
  return <header className={`page-header ${transparentClass} ${className}`} {...props} />;
}
export function PageFooter(props: HTMLAttributes<HTMLElement>) {
  return <footer {...props} />;
}
export function Toolbar(props: BoxProps) {
  return <div className="toolbar" {...props} />;
}
export function PageTitle({
  level = 1,
  className = '',
  ...props
}: HTMLAttributes<HTMLHeadingElement> & { level?: 1 | 2 }) {
  // Экран держит ровно один <h1>. Модалка открывается ПОВЕРХ страницы, чей
  // <h1> остаётся в документе, поэтому её собственная шапка берёт level={2} —
  // визуально та же строка, но иерархия заголовков не ломается.
  const Heading = level === 1 ? 'h1' : 'h2';
  return <Heading className={`page-title ${className}`} {...props} />;
}
export function ToolbarActions({ slot, ...props }: BoxProps) {
  return <div className={`toolbar-actions toolbar-actions--${slot ?? 'end'}`} {...props} />;
}
export function Text(props: HTMLAttributes<HTMLSpanElement>) {
  return <span {...props} />;
}
export function Avatar(props: BoxProps) {
  return <div className="avatar" {...props} />;
}
export function Icon({
  icon: Glyph,
  slot: _slot,
  ...props
}: HTMLAttributes<SVGSVGElement> & { icon: LucideIcon }) {
  return <Glyph aria-hidden="true" size="1em" {...props} />;
}
export function Spinner({
  name: _name,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { name?: string }) {
  return <span role="status" aria-label="Загрузка" className="spinner" {...props} />;
}
export function SkeletonBlock({
  animated: _animated,
  className = '',
  ...props
}: BoxProps & { animated?: boolean }) {
  return <div aria-hidden="true" className={`skeleton-block ${className}`} {...props} />;
}

type ActionProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  fill?: 'solid' | 'outline' | 'clear';
  expand?: 'block';
  color?: string;
  size?: 'small' | 'default' | 'large';
};
export function ActionButton({
  fill = 'clear',
  expand,
  color,
  size,
  className = '',
  type = 'button',
  ...props
}: ActionProps) {
  // Text size follows the Figma type scale: 16px SemiBold (text-h3) for the
  // pill-shaped solid/outline variants (Button.tsx CTAs). The bare `clear` fill
  // is an icon-only affordance (Modal close, password eye, notification bell,
  // calendar month nav) and keeps its compact 44px tap target and default
  // sizing instead of the CTA shape.
  const textClass = fill === 'clear' ? '' : 'text-h3';
  return (
    <button
      type={type}
      className={`action-button action-button--${fill} ${textClass} ${expand ? 'w-full' : ''} ${color === 'danger' ? 'action-button--danger' : ''} ${size === 'small' ? 'action-button--small' : ''} ${className}`}
      {...props}
    />
  );
}
// Стрелка «назад» — ИКОНКА, а не типографский символ «‹» (U+2039): у глифа
// собственные метрики, и его ink-центр отстоит от центра строчного бокса на
// 1.92px. `align-items: center` центрирует строчный бокс, а не глиф внутри
// него, поэтому CSS-правками это расхождение не снимается. Иконка рисуется по
// геометрии своего вьюбокса, симметричного относительно центра, — её
// ink-центр совпадает с центром бокса по построению.
function BackGlyph() {
  return <Icon icon={chevronBack} className="history-back__glyph" />;
}
function RouterBack({ defaultHref, text }: { defaultHref: string; text?: string }) {
  const navigate = useNavigate();
  const navigation = useContext(NavigationContext);
  return (
    <button
      type="button"
      aria-label="Назад"
      className="history-back"
      onClick={() => {
        if (navigation) navigation.goBack(defaultHref);
        else if (window.history.state?.idx > 0) void navigate(-1);
        else void navigate(defaultHref, { replace: true });
      }}
    >
      <BackGlyph />
      {text}
    </button>
  );
}
export function HistoryBack({
  defaultHref = '/app/home',
  text = '',
}: {
  defaultHref?: string;
  text?: string;
}) {
  const inRouter = useInRouterContext();
  return inRouter ? (
    <RouterBack defaultHref={defaultHref} text={text} />
  ) : (
    <a aria-label="Назад" className="history-back" href={defaultHref}>
      <BackGlyph />
      {text}
    </a>
  );
}

type OptionProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  value: string;
  selected?: boolean;
  onSelectValue?: (value: string) => void;
};
export function SegmentOption({ value, selected, onSelectValue, children, ...props }: OptionProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      className="segment-option text-body-m"
      onClick={() => onSelectValue?.(value)}
      {...props}
    >
      {children}
    </button>
  );
}
export function Segment({
  value,
  onChange,
  children,
  className = '',
}: {
  value?: string;
  onChange: (event: { target: { value: string } }) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div role="tablist" className={`segment ${className}`}>
      {Children.map(children, (child) =>
        isValidElement(child)
          ? cloneElement(child as ReactElement<OptionProps>, {
              selected: (child.props as OptionProps).value === value,
              onSelectValue: (value) => onChange({ target: { value } }),
            })
          : child,
      )}
    </div>
  );
}
export function Toggle(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="checkbox" role="switch" className="toggle" {...props} />;
}
export function SearchInput({
  debounce: _debounce,
  showClearButton: _showClearButton,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { debounce?: number; showClearButton?: string }) {
  return <input type="search" aria-label={props.placeholder ?? 'Поиск'} {...props} />;
}

export function Dialog({
  isOpen,
  onClose,
  children,
  className = '',
  style,
  ...props
}: BoxProps & { isOpen: boolean; onClose?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useLayoutEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const root = ref.current;
    const focusable = () => [
      ...(root?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], iframe:not([tabindex="-1"]), [tabindex="0"]',
      ) ?? []),
    ];
    if (!root?.contains(document.activeElement)) (focusable()[0] ?? root)?.focus();
    const listener = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current?.();
      }
      if (event.key === 'Tab') {
        const nodes = focusable();
        const first = nodes[0];
        const last = nodes.at(-1);
        if (!first) {
          event.preventDefault();
          return;
        }
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    root?.addEventListener('keydown', listener);
    return () => {
      root?.removeEventListener('keydown', listener);
      previous?.focus();
    };
  }, [isOpen]);
  if (!isOpen) return null;
  return createPortal(
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={`dialog ${className}`}
        style={style}
        {...props}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

export { useToast, useAlert } from './feedback';
