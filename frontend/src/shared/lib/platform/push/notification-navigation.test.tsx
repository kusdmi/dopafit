import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const push = vi.fn();
vi.mock('@/shared/lib/navigation', () => ({ useNavigation: () => ({ push }) }));

/** Минимальный стенд навигатора: даёт добраться до обработчика 'message'. */
const listeners = new Map<string, (event: MessageEvent) => void>();

beforeEach(() => {
  listeners.clear();
  // Адрес общий на весь файл: без сброса метка из одного теста дотекла бы до следующего.
  window.history.replaceState({}, '', '/');
  vi.stubGlobal('navigator', {
    serviceWorker: {
      addEventListener: (type: string, cb: (event: MessageEvent) => void) =>
        listeners.set(type, cb),
      removeEventListener: (type: string) => listeners.delete(type),
    },
  });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function emit(data: unknown) {
  listeners.get('message')?.({ data } as MessageEvent);
}

it('переводит на маршрут из уведомления', async () => {
  const { useNotificationNavigation } = await import('./notification-navigation');
  renderHook(() => useNotificationNavigation());

  emit({ type: 'notification-click', url: '/app/settings/connections' });
  expect(push).toHaveBeenCalledWith('/app/settings/connections');
});

it('игнорирует чужие сообщения и абсолютные URL', async () => {
  const { useNotificationNavigation } = await import('./notification-navigation');
  renderHook(() => useNotificationNavigation());

  // Абсолютный URL увёл бы установленную PWA на чужой origin.
  emit({ type: 'notification-click', url: 'https://evil.example/steal' });
  emit({ type: 'workbox-broadcast-update', url: '/app/home' });
  emit('строка');
  emit(null);
  expect(push).not.toHaveBeenCalled();
});

it('гасит уведомление, метка которого приехала с сообщением', async () => {
  const onOpen = vi.fn();
  const { useNotificationNavigation } = await import('./notification-navigation');
  renderHook(() => useNotificationNavigation(onOpen));

  emit({
    type: 'notification-click',
    url: '/app/settings/connections?tab=requests',
    notificationId: 'n-42',
  });

  expect(onOpen).toHaveBeenCalledWith('n-42');
  // Переход не ждёт пометки — оба действия происходят в одном обработчике.
  expect(push).toHaveBeenCalledWith('/app/settings/connections?tab=requests');
});

it('переходит и без метки: старый payload не должен ломать навигацию', async () => {
  const onOpen = vi.fn();
  const { useNotificationNavigation } = await import('./notification-navigation');
  renderHook(() => useNotificationNavigation(onOpen));

  emit({ type: 'notification-click', url: '/app/home', notificationId: null });

  expect(onOpen).not.toHaveBeenCalled();
  expect(push).toHaveBeenCalledWith('/app/home');
});

it('гасит уведомление, метка которого пришла в адресе при холодном старте', async () => {
  // openWindow не умеет ни сообщений, ни history state — метка едет только в query.
  window.history.replaceState({}, '', '/app/settings/connections?tab=requests&notification_id=n-7');
  const onOpen = vi.fn();
  const { useNotificationNavigation } = await import('./notification-navigation');
  renderHook(() => useNotificationNavigation(onOpen));

  expect(onOpen).toHaveBeenCalledWith('n-7');
  // Параметр одноразовый: он не должен пережить обработку и попасть в скопированную ссылку.
  expect(window.location.search).toBe('?tab=requests');
});

it('не трогает адрес, когда метки в нём нет', async () => {
  window.history.replaceState({}, '', '/app/home?tab=requests');
  const onOpen = vi.fn();
  const { useNotificationNavigation } = await import('./notification-navigation');
  renderHook(() => useNotificationNavigation(onOpen));

  expect(onOpen).not.toHaveBeenCalled();
  expect(window.location.search).toBe('?tab=requests');
});

it('снимает слушатель при размонтировании', async () => {
  const { useNotificationNavigation } = await import('./notification-navigation');
  const { unmount } = renderHook(() => useNotificationNavigation());
  expect(listeners.has('message')).toBe(true);
  unmount();
  expect(listeners.has('message')).toBe(false);
});
