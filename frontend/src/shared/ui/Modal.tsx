import {
  ActionButton,
  ToolbarActions,
  PageContent,
  PageFooter,
  PageHeader,
  Icon,
  Dialog,
  PageTitle,
  Toolbar,
} from '@/shared/ui/primitives';
import { close } from '@/shared/ui/icons';
import type { ReactNode } from 'react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Optional sticky footer (e.g. primary action). */
  footer?: ReactNode;
  /**
   * `popup` (Figma 1119:2607) — a centred card for a short list or a form of a
   * couple of fields, where a full-screen sheet is nine tenths empty space.
   * Defaults to the full-screen sheet, which stays right for wizards, long
   * forms and anything that scrolls for real.
   */
  variant?: 'fullscreen' | 'popup';
}

// Content modal with a consistent header + close button (iOS style).
// Use for modals that show content/forms. For yes/no confirmations use ConfirmDialog.
export function Modal({ isOpen, onClose, title, children, footer, variant = 'fullscreen' }: Props) {
  if (variant === 'popup') {
    return (
      // Геометрия карточки — в .dialog--popup (overlays.css), здесь только
      // раскладка её содержимого: шапка 22px Bold + крестик 32px, затем список.
      // PageHeader/Toolbar намеренно НЕ используются: они несут собственные
      // отступы и safe-area под полноэкранный лист, а попап стоит по центру.
      <Dialog isOpen={isOpen} onClose={onClose} className="dialog--popup gap-[15px] p-[25px]">
        <div className="flex items-center justify-between gap-3">
          {/* level={2} по той же причине, что и у полноэкранного варианта ниже:
              страница под модалкой не размонтируется и её <h1> остаётся в
              документе.

              `text-left text-h1` — заголовок попапа по макету прижат влево и
              набран 22/700, тогда как `.page-title` по умолчанию центрирует и
              даёт H2 (18px). `.text-left` — штатный опт-аут из этого правила
              (см. layout.css), им же пользуются корневые экраны вкладок. */}
          {/* `whitespace-normal` снимает nowrap+ellipsis из `.page-title`: тот
              расчёт под тулбар, где заголовок обязан остаться одной строкой.
              В попапе обрезать нечем — рядом только крестик, — и длинный
              заголовок молча терял хвост. Пусть лучше переносится. */}
          <PageTitle level={2} className="text-h1 whitespace-normal text-left">
            {title}
          </PageTitle>
          <ActionButton onClick={onClose} aria-label="Закрыть">
            {/* 32px по макету; Icon наследует размер от font-size кнопки, а
                `clear` его не задаёт — отсюда явный класс (тот же приём, что в
                EventViewModal). Цвет — нейтральный контент: в макете крестик
                белый, а не акцентный. */}
            <Icon slot="icon-only" icon={close} className="text-[32px] text-content" />
          </ActionButton>
        </div>
        {/* Скроллится содержимое, а не карточка целиком: шапка с крестиком
            должна оставаться на месте у длинного списка. */}
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer}
      </Dialog>
    );
  }

  return (
    <Dialog isOpen={isOpen} onClose={onClose}>
      <PageHeader>
        <Toolbar>
          {/* level={2}: страница под модалкой не размонтируется, её <h1>
              остаётся в документе — заголовок диалога вторым <h1> сломал бы
              иерархию. */}
          <PageTitle level={2}>{title}</PageTitle>
          <ToolbarActions slot="end">
            <ActionButton onClick={onClose} aria-label="Закрыть">
              <Icon slot="icon-only" icon={close} />
            </ActionButton>
          </ToolbarActions>
        </Toolbar>
      </PageHeader>
      <PageContent className="page-padding">{children}</PageContent>
      {footer && (
        <PageFooter>
          {/* Add the home-indicator inset to the bottom padding (this footer is a
              plain div, not an ion-toolbar, so it gets no safe-area for free) —
              mirrors ConfirmDialog/OtpDialog so the primary action clears it. */}
          <div
            className="border-t border-line bg-card p-4"
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
          >
            {footer}
          </div>
        </PageFooter>
      )}
    </Dialog>
  );
}
