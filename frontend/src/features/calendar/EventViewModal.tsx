import { Icon } from '@/shared/ui/primitives';
import { barbell, peopleOutline, checkmarkCircle } from '@/shared/ui/icons';
import type { components } from '@/shared/api/schema';
import { useNetworkStatus } from '@/shared/lib/network/useNetworkStatus';
import { formatDate } from '@/shared/lib/time/formatDate';
import { Button } from '@/shared/ui/Button';
import { Modal } from '@/shared/ui/Modal';

type EventOut = components['schemas']['EventOut'];

type Role = 'trainer' | 'client';

interface Props {
  isOpen: boolean;
  date: string;
  /** Сегодняшняя дата (ISO) — по ней отличаем прошедший день от будущего. */
  today: string;
  events: EventOut[];
  role: Role;
  onClose: () => void;
  onAddAnother: () => void;
  onEditEvent: (event: EventOut) => void;
  onCancelEvent: (id: string) => void;
  cancelPending?: boolean;
}

function typeLabel(type: EventOut['type'], role: Role): string {
  if (type === 'personal') return 'Личная';
  return role === 'trainer' ? 'С клиентами' : 'С тренером';
}

// Цвет роли тренировки (Figma 392:4672): личная — акцент, совместная —
// «тренерский» фиолетовый. Он красит и обводку карточки, и её иконку, поэтому
// хранится одной записью, а не двумя разбросанными тернарниками.
const TYPE_COLOR: Record<EventOut['type'], { border: string; icon: string }> = {
  personal: { border: 'border-brand-400', icon: 'text-brand-400' },
  with_clients: { border: 'border-trainer-400', icon: 'text-trainer-400' },
};

export function EventViewModal({
  isOpen,
  date,
  today,
  events,
  role,
  onClose,
  onAddAnother,
  onEditEvent,
  onCancelEvent,
  cancelPending,
}: Props) {
  const { isOffline } = useNetworkStatus();
  // ISO-даты сравнимы как строки, поэтому день «прошёл», если он строго меньше
  // сегодняшнего. Сегодняшний прошедшим не считается: тренировку этого дня ещё
  // можно перенести на вечер.
  const isPast = date < today;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Тренировки на ${formatDate(date)}`}
      variant="popup"
    >
      <ul className="flex flex-col gap-[15px]">
        {events.map((event) => {
          // Clients may only cancel/edit their own personal sessions; trainers act on any planned.
          const canModify =
            event.status === 'planned' && (role === 'trainer' || event.type === 'personal');
          // Прошедший день не переносят: «Изменить» там предлагало бы
          // запланировать то, что уже не состоится. А вот ОТМЕНА прошлой записи
          // осмысленна — это единственный способ убрать из календаря план,
          // который не выполнили: сам он так и висит в статусе planned.
          const canEdit = canModify && !isPast;
          const color = TYPE_COLOR[event.type];
          const counterpartName =
            event.type === 'with_clients'
              ? role === 'trainer'
                ? event.clients.map((client) => client.name).join(', ')
                : event.owner_name
              : '';
          return (
            <li
              key={event.id}
              className={`flex flex-col gap-[10px] rounded-[15px] border p-[15px] text-content ${color.border}`}
            >
              <div className="flex items-center justify-between gap-[10px]">
                <span className="flex items-center gap-[10px] text-h3">
                  <Icon
                    icon={event.type === 'personal' ? barbell : peopleOutline}
                    className={`text-[24px] ${color.icon}`}
                  />
                  {typeLabel(event.type, role)}
                </span>
                {event.status === 'completed' && (
                  <span className="flex shrink-0 items-center gap-[5px] rounded-full bg-success-soft-bg px-2 py-0.5 text-tag text-success-soft-fg">
                    <Icon icon={checkmarkCircle} className="text-[14px]" />
                    Завершено
                  </span>
                )}
              </div>

              <p className="text-body-m text-content">{event.time.slice(0, 5)}</p>

              {event.program_name && (
                <p className="text-body-m text-content">Программа: {event.program_name}</p>
              )}

              {/* Тренеру показываем клиентов, клиенту — автора записи. */}
              {counterpartName && (
                <p className="flex items-center gap-[10px] text-body-m text-content">
                  <Icon icon={peopleOutline} className="shrink-0 text-[20px] text-muted" />
                  {counterpartName}
                </p>
              )}

              {canModify && (
                <div className="flex gap-2">
                  {canEdit && (
                    <Button
                      variant="outline"
                      disabled={isOffline}
                      onClick={() => onEditEvent(event)}
                    >
                      {isOffline ? 'Недоступно офлайн' : 'Изменить'}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    disabled={isOffline}
                    loading={cancelPending}
                    onClick={() => onCancelEvent(event.id)}
                  >
                    {isOffline ? 'Недоступно офлайн' : 'Отменить'}
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* На прошедший день не записываются — ни первой тренировкой, ни ещё
          одной. Кнопки просто нет: сервер такую запись отклонит
          (CalendarApplication.rejectPastDate), и предлагать заполнить форму
          ради отказа незачем. Отмена невыполненного плана выше остаётся. */}
      {!isPast && (
        <div className="mt-4">
          <Button onClick={onAddAnother}>Добавить тренировку</Button>
        </div>
      )}
    </Modal>
  );
}
