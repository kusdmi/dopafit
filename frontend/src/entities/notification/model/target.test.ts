import { describe, expect, it } from 'vitest';

import { paths } from '@/shared/config/paths';

import type { NotificationItem } from '../api/use-notifications';
import { notificationTarget } from './target';

function item(type: NotificationItem['type']): NotificationItem {
  return {
    id: 'n1',
    type,
    title: 'Заголовок',
    body: 'Текст',
    payload: null,
    is_read: false,
    created_at: '2026-06-01T10:00:00Z',
  };
}

describe('notificationTarget', () => {
  it('ведёт запрос на связь на экран связей и просит вкладку «Запросы»', () => {
    expect(notificationTarget(item('link_request'))).toEqual({
      to: `${paths.connections}?tab=requests`,
      state: { tab: 'requests' },
    });
  });

  it('сохраняет идентификатор заявки в ссылке', () => {
    const notification = item('link_request');
    notification.payload = { request_id: 'request-1' };
    expect(notificationTarget(notification)?.to).toBe(
      `${paths.connections}?tab=requests&request_id=request-1`,
    );
  });

  it('не выдумывает переход для типов, у которых экрана ответа нет', () => {
    // Кликабельная карточка, которая никуда не ведёт, хуже некликабельной.
    for (const type of [
      'subscription',
      'referral',
      'support',
      'workout_reminder',
      'system',
      'account',
    ] as const) {
      expect(notificationTarget(item(type)), type).toBeNull();
    }
  });
});

it('держит маршрут таким, каким его зашил backend в push-уведомление', () => {
  // Правило «link_request → экран связей» продублировано в
  // backend/src/modules/messaging/domain/push-target.ts: service worker про
  // роутинг не знает, и URL для системного пуша собирает сервер. Импортировать
  // paths оттуда нельзя — разные рантаймы и разные сборки, — поэтому путь там
  // записан литералом. Этот тест ломается, если paths.connections переехал, а
  // литерал на бэкенде остался прежним: иначе тап по пушу молча открывал бы 404.
  expect(paths.connections).toBe('/app/settings/connections');
});
