import { paths } from '@/shared/config/paths';

import type { NotificationItem } from '../api/use-notifications';

/** Куда ведёт уведомление: маршрут и состояние истории для него. */
export interface NotificationTarget {
  to: string;
  state?: unknown;
}

/**
 * Маршрут, на который открывается уведомление, или `null`, если идти некуда.
 *
 * Живёт в модели сущности, а не в компоненте экрана: это правило предметной
 * области («уведомление такого-то типа разбирают там-то»), а не вёрстка.
 * Так его можно проверить отдельным юнит-тестом и переиспользовать — тот же
 * переход понадобится при тапе по системному пушу, который экран уведомлений
 * вообще не рендерит.
 *
 * Пока такой тип один — `link_request`: заявка на связь ждёт ответа, а
 * отвечают на неё на экране «Мои клиенты»/«Мой тренер». Маршрут общий для
 * обеих ролей (ClientsPage сам выбирает вид по роли); тренеру дополнительно
 * просим открыть вкладку «Запросы» — у клиента отдельной вкладки нет, и лишнее
 * состояние там просто игнорируется.
 *
 * Для остальных типов — `null`, и карточка остаётся некликабельной: элемент
 * управления, который ничего не делает, хуже обычного текста.
 *
 * ⚠️ ПРАВИЛО ПРОДУБЛИРОВАНО НА БЭКЕНДЕ.
 * То же соответствие «тип уведомления → экран» живёт в
 * `backend/src/modules/messaging/domain/push-target.ts`: тап по СИСТЕМНОМУ пушу
 * разбирает service worker, который про роутинг приложения не знает ничего и
 * умеет только открыть URL, — поэтому маршрут туда кладёт сервер. Общий модуль
 * между рантаймами невозможен, так что при изменении правила правятся ОБА
 * файла. Разница ровно одна: вкладка здесь едет в state истории, а в пуше — в
 * query-параметре `?tab=requests` (у openWindow никакого state нет).
 * `TrainerClientsView` читает оба источника.
 */
export function notificationTarget(item: NotificationItem): NotificationTarget | null {
  if (item.type !== 'link_request') return null;
  const params = new URLSearchParams({ tab: 'requests' });
  const requestId = item.payload?.request_id;
  if (typeof requestId === 'string') params.set('request_id', requestId);
  return { to: `${paths.connections}?${params}`, state: { tab: 'requests' } };
}
