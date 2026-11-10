import { Modal } from '@/shared/ui/Modal';

export interface PickerOption {
  id: string;
  label: string;
}

interface Props {
  isOpen: boolean;
  title: string;
  options: PickerOption[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  /** Shown instead of the list when there is nothing to pick from. */
  emptyLabel?: string;
}

export function PickerModal({
  isOpen,
  title,
  options,
  selectedId,
  onSelect,
  onClose,
  emptyLabel = 'Нет доступных вариантов',
}: Props) {
  return (
    // Figma 392:2618 / 392:2820 / 1119:2607 — один и тот же попап-пикер под три
    // списка (замер, упражнение рекорда, упражнение силового прогресса).
    <Modal isOpen={isOpen} onClose={onClose} title={title} variant="popup">
      {options.length === 0 ? (
        <p className="text-body-m text-muted">{emptyLabel}</p>
      ) : (
        <ul className="flex flex-col gap-[10px]">
          {options.map((o) => {
            const selected = o.id === selectedId;
            return (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(o.id);
                    onClose();
                  }}
                  aria-pressed={selected}
                  // Плашка по макету: радиус 15px, padding 10px, невыбранные на
                  // нейтральной подложке, выбранная — заливкой chart-4 (тот же
                  // фиолетовый «Ан - Фиол.» #C96EFF, что у карточки рекорда).
                  // Текст на заливке — фиксированный chart-4-fg, как везде на
                  // насыщенном фоне (см. WeekStrip).
                  className={`text-body-m w-full rounded-[15px] p-[10px] text-left ${
                    selected ? 'bg-chart-4 text-chart-4-fg' : 'bg-card-light text-content'
                  }`}
                >
                  {o.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
