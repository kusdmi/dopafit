import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';

interface FinishDialogProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  pending?: boolean;
}

export function FinishDialog({ isOpen, onConfirm, onCancel, pending = false }: FinishDialogProps) {
  return (
    <ConfirmDialog
      isOpen={isOpen}
      title="Завершить тренировку?"
      message="Результаты подходов сохранятся, продолжить эту тренировку будет нельзя."
      // Кнопки называют действие, а не отвечают «да/нет»: во всех остальных
      // диалогах приложения подпись — это то, что произойдёт, и «Да» рядом с
      // «Завершить»/«Удалить»/«Выйти» заставляло перечитывать заголовок.
      confirmLabel="Завершить"
      cancelLabel="Отмена"
      pending={pending}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
