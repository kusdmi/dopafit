import { useNetworkStatus } from '@/shared/lib/network/useNetworkStatus';
import { Button } from '@/shared/ui/Button';

interface Props {
  loading: boolean;
  onCancel: () => void;
  submitLabel?: string;
  /**
   * Фиолетовая кнопка подтверждения вместо акцентной (макет 392:4474). Это
   * запись КЛИЕНТА тренером, а фиолетовый в системе — цвет всего, что про
   * клиентов (серия 4, ею же обведены карточки клиентов). Когда человек
   * записывается сам, цвет остаётся обычным акцентным.
   */
  clientTone?: boolean;
}

// Cancel / submit footer with the offline gate, shared by the booking + edit forms.
// «Отмена» — нейтральная ЗАЛИВКА, а не обводка: пара кнопок в попапе по макету
// набрана двумя сплошными плашками. Тот же приём уже применён в DayModal.
export function BookingFormActions({
  loading,
  onCancel,
  submitLabel = 'Записать',
  clientTone = false,
}: Props) {
  const { isOffline } = useNetworkStatus();
  return (
    <div className="flex gap-[15px]">
      <Button
        type="button"
        variant="primary"
        className="bg-card-light text-content"
        onClick={onCancel}
      >
        Отмена
      </Button>
      <Button
        type="submit"
        variant="primary"
        className={clientTone ? 'bg-chart-4 text-chart-4-fg' : undefined}
        disabled={isOffline}
        loading={loading}
      >
        {isOffline ? 'Недоступно офлайн' : submitLabel}
      </Button>
    </div>
  );
}
