import { AppFrame } from '@/shared/ui/primitives';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import type { components } from '@/shared/api/schema';

import { EventViewModal } from './EventViewModal';

type EventOut = components['schemas']['EventOut'];

const networkStatus = { isOnline: true, isOffline: false };
vi.mock('@/shared/lib/network/useNetworkStatus', () => ({
  useNetworkStatus: () => networkStatus,
}));

afterEach(() => {
  networkStatus.isOnline = true;
  networkStatus.isOffline = false;
});

const plannedPersonal: EventOut = {
  id: 'e1',
  owner_name: 'Вы',
  program_id: null,
  program_name: null,
  date: '2026-06-20',
  time: '09:00',
  type: 'personal',
  status: 'planned',
  workout_session_id: null,
  clients: [],
};
const completedWithClients: EventOut = {
  id: 'e2',
  program_id: 'program-1',
  program_name: 'Силовая программа',
  date: '2026-06-20',
  time: '12:00',
  type: 'with_clients',
  status: 'completed',
  workout_session_id: null,
  clients: [{ client_id: 'c1', name: 'Вася' }],
  owner_name: 'Тренер Петя',
};

function renderModal(props: Partial<Parameters<typeof EventViewModal>[0]> = {}) {
  const onCancelEvent = vi.fn();
  const onAddAnother = vi.fn();
  const onEditEvent = vi.fn();
  render(
    <AppFrame>
      <EventViewModal
        isOpen
        date="2026-06-20"
        // Значение по умолчанию — тот же день, что и события: тесты не должны
        // зависеть от того, когда их запускают.
        today="2026-06-20"
        events={[plannedPersonal, completedWithClients]}
        role="trainer"
        onClose={() => {}}
        onAddAnother={onAddAnother}
        onEditEvent={onEditEvent}
        onCancelEvent={onCancelEvent}
        {...props}
      />
    </AppFrame>,
  );
  return { onCancelEvent, onAddAnother, onEditEvent };
}

it('lists events and shows Завершено only for completed', () => {
  renderModal();
  expect(screen.getByText('09:00')).toBeInTheDocument();
  expect(screen.getByText('12:00')).toBeInTheDocument();
  expect(screen.getByText('Вася')).toBeInTheDocument();
  // Only one "Завершено" badge (the completed event).
  expect(screen.getAllByText('Завершено')).toHaveLength(1);
});

it('cancels a planned event when online', () => {
  const { onCancelEvent } = renderModal();
  fireEvent.click(screen.getByRole('button', { name: 'Отменить' }));
  expect(onCancelEvent).toHaveBeenCalledWith('e1');
});

it('edits a planned event', () => {
  const { onEditEvent } = renderModal();
  fireEvent.click(screen.getByRole('button', { name: 'Изменить' }));
  expect(onEditEvent).toHaveBeenCalledWith(plannedPersonal);
});

it('disables edit and cancel when offline', () => {
  networkStatus.isOnline = false;
  networkStatus.isOffline = true;
  renderModal({ events: [plannedPersonal] });
  // Both the edit and cancel buttons collapse to the offline label and disable.
  const offlineButtons = screen.getAllByRole('button', { name: 'Недоступно офлайн' });
  expect(offlineButtons).toHaveLength(2);
  offlineButtons.forEach((b) => expect(b).toBeDisabled());
});

it('calls onAddAnother', () => {
  const { onAddAnother } = renderModal();
  fireEvent.click(screen.getByText('Добавить тренировку'));
  expect(onAddAnother).toHaveBeenCalledTimes(1);
});

it('labels a with_clients event "С клиентами" for a trainer', () => {
  renderModal({ events: [completedWithClients], role: 'trainer' });
  expect(screen.getByText('С клиентами')).toBeInTheDocument();
  expect(screen.queryByText('С тренером')).not.toBeInTheDocument();
});

it('labels a with_clients event "С тренером" for a client', () => {
  renderModal({ events: [completedWithClients], role: 'client' });
  expect(screen.getByText('С тренером')).toBeInTheDocument();
  expect(screen.getByText('Тренер Петя')).toBeInTheDocument();
  expect(screen.getByText('Программа: Силовая программа')).toBeInTheDocument();
  expect(screen.queryByText('Вася')).not.toBeInTheDocument();
  expect(screen.queryByText('С клиентами')).not.toBeInTheDocument();
});

// Прошедший день нельзя перенести — «Изменить» там бессмысленно.
it('hides Изменить once the day is in the past', () => {
  renderModal({ today: '2026-06-21' });
  expect(screen.queryByRole('button', { name: 'Изменить' })).not.toBeInTheDocument();
});

// Отмену прошлой записи оставляем: это единственный способ убрать из календаря
// план, который так и не выполнили.
it('still allows cancelling a past planned event', () => {
  const { onCancelEvent } = renderModal({ today: '2026-06-21' });
  fireEvent.click(screen.getByRole('button', { name: 'Отменить' }));
  expect(onCancelEvent).toHaveBeenCalledWith('e1');
});

it('keeps Изменить available on today and in the future', () => {
  renderModal({ today: '2026-06-19' });
  expect(screen.getByRole('button', { name: 'Изменить' })).toBeInTheDocument();
});

// На прошедший день не записываются: кнопка «Добавить тренировку» убрана,
// чтобы не вести к форме, которую сервер всё равно отклонит.
it('hides the add button on a day that has passed', () => {
  renderModal({ today: '2026-06-25' });
  expect(screen.queryByText('Добавить тренировку')).not.toBeInTheDocument();
});

// В будущем дне кнопка на месте — правило не должно задевать обычный случай.
it('keeps the add button on a day that has not passed', () => {
  renderModal({ today: '2026-06-20' });
  expect(screen.getByText('Добавить тренировку')).toBeInTheDocument();
});
