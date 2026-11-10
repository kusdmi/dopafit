import { Dialog } from '@/shared/ui/primitives';

import { Button } from '@/shared/ui/Button';

interface Props {
  isOpen: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** When true the confirm action is styled as destructive (danger). */
  destructive?: boolean;
  pending?: boolean;
  cancelDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// Compact, centered yes/no dialog (not full-screen). Its box — width, max-width,
// auto height, radius and the overlay shadow — is owned entirely by the
// `.dialog.confirm-dialog` rule in app/styles/components/overlays.css. The
// component used to ALSO pass `--width`/`--max-width`/`--height`/`--border-radius`
// inline, but those are only fallbacks inside `.dialog` (`var(--max-width, 640px)`)
// and the more specific class rule overrode every one of them. Two declarations
// of one box, disagreeing; the class is the one that was actually rendering, so
// it is the one kept.
//
// Коробка и внутренние отступы — те же, что у попапа (`Modal variant="popup"`,
// design-system.md «Модалки»): 25px padding, радиус 25px, заголовок H1 слева.
// Диалог подтверждения раньше был своей, более узкой и острой карточкой, и
// «Выйти из аккаунта?» рядом с обычным попапом читался как окно из другого
// приложения. Крестика здесь нет намеренно: у вопроса «да/нет» закрытие — это
// «Отмена», и третий способ уйти только размывал бы ответ.
export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Да',
  cancelLabel = 'Отмена',
  destructive = false,
  pending = false,
  cancelDisabled = false,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Dialog
      isOpen={isOpen}
      onClose={() => {
        if (!cancelDisabled) onCancel();
      }}
      className="confirm-dialog dialog--floating"
    >
      {/* `rounded-[25px]` repeats the class's own radius on purpose: `.dialog`
          has no `overflow: hidden`, so this filling child would square the
          corners off again without it.

          Padding is a plain symmetric `p-[25px]`. It used to add
          `env(safe-area-inset-bottom)` to the bottom, which is the right move
          for a panel pinned to the bottom edge but wrong here: this dialog is
          centred by `.dialog-backdrop` (flex, `align-items: center`), and the
          home-indicator inset is already applied once — as a margin on
          `.dialog--floating`, the class this dialog carries. The card was
          counting it a second time, so it showed 20px of padding above the
          title against 54px below the buttons on a gesture-bar iPhone. That
          class also caps `max-height` by the same insets, so a dialog too tall
          for the screen still clears the indicator and scrolls inside it. */}
      <div className="rounded-[25px] bg-card p-[25px] text-content">
        <h2 className="text-h1">{title}</h2>
        {message && <p className="mt-[15px] text-body-m text-muted">{message}</p>}
        <div className="mt-[25px] flex gap-[15px]">
          <Button variant="outline" type="button" disabled={cancelDisabled} onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant="primary"
            type="button"
            color={destructive ? 'danger' : undefined}
            loading={pending}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
