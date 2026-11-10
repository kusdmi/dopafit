import { Modal } from '@/shared/ui/Modal';

import { ClientBookingForm } from './ClientBookingForm';
import { TrainerBookingForm } from './TrainerBookingForm';

type Role = 'trainer' | 'client';

interface Props {
  isOpen: boolean;
  date: string;
  role: Role;
  onClose: () => void;
  onSubmitted: () => void;
}

export function EventBookingModal({ isOpen, date, role, onClose, onSubmitted }: Props) {
  return (
    // Макет 392:4474 — попап, а не полноэкранный лист: в форме два поля и
    // список клиентов. Заголовок у тренера «Записать клиента» (он записывает
    // кого-то), у клиента остаётся «Запись на тренировку» — тот записывается
    // сам, и списка клиентов у него нет.
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={role === 'trainer' ? 'Записать клиента' : 'Запись на тренировку'}
      variant="popup"
    >
      {role === 'trainer' ? (
        <TrainerBookingForm date={date} onClose={onClose} onSubmitted={onSubmitted} />
      ) : (
        <ClientBookingForm date={date} onClose={onClose} onSubmitted={onSubmitted} />
      )}
    </Modal>
  );
}
