import { Icon } from '@/shared/ui/primitives';
import {
  barbellOutline,
  chatbubbleEllipsesOutline,
  diamondOutline,
  giftOutline,
  informationCircleOutline,
  mailOutline,
  notificationsOutline,
  personAddOutline,
} from '@/shared/ui/icons';

import type { NotificationItem } from '@/entities/notification/api/use-notifications';
import { notificationTarget } from '@/entities/notification/model/target';
import { useMarkNotificationRead } from '@/entities/notification/model/use-open-notification';
import { useNavigation } from '@/shared/lib/navigation';
import { formatDate } from '@/shared/lib/time/formatDate';

const TYPE_ICON: Record<NotificationItem['type'], typeof notificationsOutline> = {
  subscription: diamondOutline,
  referral: giftOutline,
  support: chatbubbleEllipsesOutline,
  workout_reminder: barbellOutline,
  system: informationCircleOutline,
  link_request: personAddOutline,
  account: mailOutline,
};

function iconFor(type: NotificationItem['type']): typeof notificationsOutline {
  return TYPE_ICON[type] ?? informationCircleOutline;
}

// Figma 392:2842 / 392:2849: an unfilled card outlined in the accent while
// unread and in a neutral once read, 25px radius, 15px padding, 17px gap. The
// glyph sits on a 40px pill tinted at 25% of the accent (unread only) —
// expressed with color-mix so no rgba literal is hardcoded.
//
// Прочитанная карточка обведена neutral-500, а НЕ `--line`. Заливки у карточки
// нет, поэтому её границу рисует только обводка — а `--line` (neutral-600 в
// тёмной теме, neutral-300 в светлой) даёт на фоновом градиенте всего 1.87:1 и
// 1.77:1, ниже порога 3:1 для нечитаемых элементов интерфейса. Обводка
// практически не видна, и подряд идущие прочитанные уведомления читались одним
// сплошным блоком, хотя отступ между ними (15px) на месте.
//
// neutral-500 (#6e6a64) — единственная ступень шкалы, которая проходит порог в
// ОБЕИХ темах на всех трёх точках градиента: 3.41–3.61:1 в тёмной и 4.84–5.14:1
// в светлой. Она нетематическая, поэтому здесь одно значение на обе темы, без
// пары токенов.
function cardClass(isRead: boolean): string {
  return `flex w-full items-center gap-[17px] rounded-[25px] border p-[15px] text-left ${
    isRead ? 'border-neutral-500' : 'border-brand-400'
  }`;
}

/** Содержимое карточки — одинаковое и для кликабельного, и для обычного вида. */
function CardBody({ item }: { item: NotificationItem }) {
  return (
    <>
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-[25px]"
        style={
          item.is_read
            ? undefined
            : { background: 'color-mix(in srgb, var(--color-brand-400) 25%, transparent)' }
        }
      >
        <Icon
          icon={iconFor(item.type)}
          style={{ fontSize: 22 }}
          className={item.is_read ? 'text-muted' : 'text-brand-text'}
        />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          {!item.is_read && (
            <span aria-hidden className="size-2 shrink-0 rounded-full bg-brand-400" />
          )}
          <span className="text-h2 min-w-0 truncate text-content">{item.title}</span>
        </div>
        <p className="text-body-m text-content">{item.body}</p>
        <p className="text-caption text-muted">{formatDate(item.created_at)}</p>
      </div>
    </>
  );
}

export function NotificationCard({ item }: { item: NotificationItem }) {
  const history = useNavigation();
  const markRead = useMarkNotificationRead();
  const target = notificationTarget(item);

  // Переход — настоящая кнопка, а не onClick на <li>: <li> не получает фокус,
  // не отвечает на Enter/Space и не читается скринридером как элемент
  // управления. Без перехода кнопки нет вовсе — пустой элемент управления
  // хуже обычного текста.
  if (!target) {
    return (
      <li className={cardClass(item.is_read)}>
        <CardBody item={item} />
      </li>
    );
  }
  return (
    <li>
      <button
        type="button"
        className={cardClass(item.is_read)}
        onClick={() => {
          // Пометка уходит фоном и намеренно НЕ ожидается: экран должен
          // открыться сразу, а сеть — не мешать переходу.
          markRead(item.id, item.is_read);
          history.push(target.to, target.state);
        }}
      >
        <CardBody item={item} />
      </button>
    </li>
  );
}
