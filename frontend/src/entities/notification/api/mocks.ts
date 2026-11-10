import { HttpResponse, http } from 'msw';

import { env } from '@/shared/config/env';

import type { NotificationItem } from './use-notifications';

const DEFAULT_ITEMS: NotificationItem[] = [];

let items: NotificationItem[] = [...DEFAULT_ITEMS];

function unreadCount(): number {
  return items.filter((n) => !n.is_read).length;
}

/** Default MSW handlers for notifications. Tests override with `server.use(...)`. */
export const notificationHandlers = [
  http.get(`${env.apiUrl}/api/v1/notifications`, () =>
    HttpResponse.json({ items, total: items.length, unread: unreadCount() }),
  ),
  http.post(`${env.apiUrl}/api/v1/notifications/read`, async ({ request }) => {
    const body = (await request.json()) as { notification_ids?: string[] } | null;
    const ids = body?.notification_ids ?? [];
    items = items.map((n) => (ids.includes(n.id) ? { ...n, is_read: true } : n));
    return HttpResponse.json({ ok: true });
  }),
  http.post(`${env.apiUrl}/api/v1/notifications/read-all`, () => {
    items = items.map((n) => ({ ...n, is_read: true }));
    return HttpResponse.json({ ok: true });
  }),
  // Дефолтные настройки уведомлений — всё включено. Тесты переопределяют через server.use(...).
  http.get(`${env.apiUrl}/api/v1/notifications/settings`, () =>
    HttpResponse.json({
      push_enabled: true,
      workout_reminders: true,
      measurement_reminders: true,
      progress_updates: true,
      weekly_reports: true,
      motivational: true,
      new_features: true,
    }),
  ),
];

/** Resets the in-memory notification store between tests. */
export function resetNotificationStore(): void {
  items = [...DEFAULT_ITEMS];
}
