import type { components } from '@/shared/api/schema';
import { Modal } from '@/shared/ui/Modal';

import { EventEditForm } from './EventEditForm';

type EventOut = components['schemas']['EventOut'];
type Role = 'trainer' | 'client';

interface Props {
  isOpen: boolean;
  event: EventOut;
  role: Role;
  onClose: () => void;
  onSubmitted: () => void;
}

export function EventEditModal({ isOpen, event, role, onClose, onSubmitted }: Props) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Изменить тренировку">
      <EventEditForm event={event} role={role} onClose={onClose} onSubmitted={onSubmitted} />
    </Modal>
  );
}
