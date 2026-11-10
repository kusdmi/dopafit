/// <reference lib="webworker" />
import { cacheNames, clientsClaim, setCacheNameDetails } from 'workbox-core';
import { createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { BUILD_MESSAGE, CLEANUP_MESSAGE } from './shared/lib/platform/app-update/worker';
import {
  cleanupStaticCaches,
  fetchStaticAsset,
} from './shared/lib/platform/app-update/static-cache';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

// Isolate releases so activation cannot delete chunks still used by another tab.
setCacheNameDetails({ prefix: 'dopafit', precache: 'static', suffix: __APP_BUILD_ID__ });
precacheAndRoute(self.__WB_MANIFEST);

// A deep link is a navigation request for its own URL, while the precache only
// contains index.html. Serve the same shell for application routes so React
// Router can restore the path and the persisted draft after an offline reload.
// API and asset URLs must retain their own failure semantics.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [/^\/api(?:\/|$)/, /\/[^/]+\.[^/]+$/],
  }),
);
registerRoute(
  ({ url }) => url.origin === self.location.origin && url.pathname.startsWith('/assets/'),
  ({ request }) => fetchStaticAsset(request, self.registration.scope),
);

// The application applies a release only at a safe moment or after confirmation.
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  if (event.data?.type === BUILD_MESSAGE) event.ports[0]?.postMessage(__APP_BUILD_ID__);
  if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
  if (event.data?.type === CLEANUP_MESSAGE)
    event.waitUntil(
      self.clients
        .matchAll({ type: 'window', includeUncontrolled: true })
        .then((clients) =>
          cleanupStaticCaches(cacheNames.precache, self.registration.scope, clients),
        ),
    );
});
clientsClaim();

// Web Push: показать уведомление при получении.
self.addEventListener('push', (event: PushEvent) => {
  const data = (() => {
    try {
      return event.data?.json() ?? {};
    } catch {
      return { body: event.data?.text() ?? '' };
    }
  })();
  const title = data.title ?? 'DopaFit';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body ?? '',
      icon: '/icons/pwa-192x192.png',
      data: data.payload ?? {},
    }),
  );
});

/** Добавляет к маршруту метку уведомления, не потеряв уже имеющийся query. */
function withNotificationId(url: string, id: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}notification_id=${encodeURIComponent(id)}`;
}

/**
 * Тап по уведомлению: открыть нужный экран и погасить само уведомление.
 *
 * `payload.url` кладёт бэкенд (`PushMessage.data`); без него открывается корень.
 * Уже открытое окно переиспользуется — второе окно PWA пользователю не нужно, — но
 * сначала ему отправляется сообщение с маршрутом: просто `focus()` оставил бы
 * приложение на том экране, где его закрыли, и тап по уведомлению не привёл бы никуда.
 * Приложение слушает это сообщение в shared/lib/platform/push/notification-navigation.ts.
 *
 * `payload.notification_id` кладёт тот же бэкенд (training UoW). Через
 * postMessage он едет отдельным полем, а через `openWindow` — только
 * query-параметром: у холодного старта нет ни сообщения, ни history state,
 * есть только URL. Оба конца разбирает notification-navigation.ts.
 */
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const data = (event.notification.data ?? {}) as { url?: unknown; notification_id?: unknown };
  // Только относительный путь: absolute URL из payload увёл бы установленную PWA
  // на чужой origin.
  const url = typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/';
  const notificationId = typeof data.notification_id === 'string' ? data.notification_id : null;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => 'focus' in c) as WindowClient | undefined;
      if (existing) {
        existing.postMessage({ type: 'notification-click', url, notificationId });
        return existing.focus();
      }
      return self.clients.openWindow(
        notificationId ? withNotificationId(url, notificationId) : url,
      );
    }),
  );
});
