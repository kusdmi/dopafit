import type { BrowserContext, Page, Response } from '@playwright/test';

import { seedSession } from '../fixtures/accounts.ts';
import { expect, test } from '../fixtures/test.ts';
import { paths } from '../support/paths.ts';

const PUSH_ENDPOINT = 'https://push.dopafit.test/e2e-subscription';
const PWA_ORIGIN = new URL(process.env.E2E_BASE_URL ?? 'http://localhost:4173').origin;

type PushProbeWindow = Window & { __e2eSubscribeCalls?: number; __e2ePermissionCalls?: number };

/** Chromium в Docker блокирует разрешение даже через grantPermissions: задаём ответ Notification и внешнего push-сервиса, а SW и API оставляем реальными. */
async function probeSubscriptions(
  context: BrowserContext,
  permission: NotificationPermission,
): Promise<void> {
  await context.addInitScript(
    ({ endpoint, permission }) => {
      const probe = window as PushProbeWindow;
      probe.__e2eSubscribeCalls = 0;
      probe.__e2ePermissionCalls = 0;
      Object.defineProperty(Notification, 'permission', {
        configurable: true,
        get: () => permission,
      });
      Notification.requestPermission = () => {
        probe.__e2ePermissionCalls = (probe.__e2ePermissionCalls ?? 0) + 1;
        return Promise.resolve(permission);
      };
      PushManager.prototype.subscribe = async function () {
        probe.__e2eSubscribeCalls = (probe.__e2eSubscribeCalls ?? 0) + 1;
        return {
          endpoint,
          getKey: (name: string) =>
            name === 'p256dh' ? new Uint8Array([1, 2, 3]).buffer : new Uint8Array([4, 5, 6]).buffer,
        } as PushSubscription;
      };
    },
    { endpoint: PUSH_ENDPOINT, permission },
  );
}

function watchRegistrations(page: Page): { count: () => number } {
  let sent = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/v1/notifications/push-token')) {
      sent += 1;
    }
  });
  return { count: () => sent };
}

async function subscribeCalls(page: Page): Promise<number> {
  return page.evaluate(() => (window as PushProbeWindow).__e2eSubscribeCalls ?? 0);
}

async function permissionCalls(page: Page): Promise<number> {
  return page.evaluate(() => (window as PushProbeWindow).__e2ePermissionCalls ?? 0);
}

async function settleSettings(page: Page): Promise<void> {
  await expect(page.getByRole('switch', { name: 'Все уведомления' })).toBeChecked();
  // После ответа настроек запускается фоновая регистрация: ждём завершения цикла отрисовки.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await page.waitForLoadState('networkidle');
}

test.describe('J. PWA и Push', () => {
  test('PWA-06 разрешение по умолчанию показывает действие, подписки ещё нет @core @pwa', async ({
    context,
    freshClient,
  }) => {
    await probeSubscriptions(context, 'default');
    const page = await context.newPage();
    const registrations = watchRegistrations(page);
    await page.goto(paths.welcome);
    expect(
      await page.evaluate(() => ({
        origin: location.origin,
        permission: Notification.permission,
        secure: isSecureContext,
      })),
    ).toEqual({ origin: PWA_ORIGIN, permission: 'default', secure: true });
    await seedSession(context, freshClient);
    expect(await page.evaluate(() => Notification.permission)).toBe('default');
    await page.goto(paths.settingsNotifications);
    await settleSettings(page);
    await expect(page.getByRole('button', { name: 'Включить уведомления' })).toBeVisible();
    await expect(page.getByText(/Браузер ещё не спрашивал разрешение/)).toBeVisible();
    expect(await page.evaluate(() => Notification.permission)).toBe('default');
    const initialPermissionCalls = await permissionCalls(page);
    expect(await subscribeCalls(page)).toBe(0);
    expect(registrations.count()).toBe(0);
    await page.reload();
    await settleSettings(page);
    await expect(page.getByRole('button', { name: 'Включить уведомления' })).toBeVisible();
    await expect(page.getByText(/Браузер ещё не спрашивал разрешение/)).toBeVisible();
    expect(await page.evaluate(() => Notification.permission)).toBe('default');
    const reloadedPermissionCalls = await permissionCalls(page);
    expect(await subscribeCalls(page)).toBe(0);
    expect(registrations.count()).toBe(0);
    expect(initialPermissionCalls).toBe(0);
    expect(reloadedPermissionCalls).toBe(0);
    await page.getByRole('button', { name: 'Включить уведомления' }).click();
    await expect.poll(() => permissionCalls(page)).toBe(1);
    expect(await subscribeCalls(page)).toBe(0);
    expect(registrations.count()).toBe(0);
  });

  test('PWA-06 запрещённое разрешение объясняется без новой подписки @core @pwa', async ({
    context,
    freshClient,
  }) => {
    await probeSubscriptions(context, 'denied');
    const page = await context.newPage();
    const registrations = watchRegistrations(page);
    await seedSession(context, freshClient);
    await page.goto(paths.settingsNotifications);
    await settleSettings(page);
    await expect(page.getByText(/Уведомления заблокированы в настройках браузера/)).toBeVisible();
    await expect(page.getByText(/откройте настройки сайта/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Включить уведомления' })).toHaveCount(0);
    expect(await page.evaluate(() => Notification.permission)).toBe('denied');
    expect(await subscribeCalls(page)).toBe(0);
    expect(registrations.count()).toBe(0);
    await page.reload();
    await settleSettings(page);
    await expect(page.getByText(/Уведомления заблокированы в настройках браузера/)).toBeVisible();
    expect(await subscribeCalls(page)).toBe(0);
    expect(registrations.count()).toBe(0);
  });

  test('PWA-06 разрешение granted создаёт подписку и регистрирует её через API @core @pwa', async ({
    context,
    freshClient,
    api,
  }) => {
    await probeSubscriptions(context, 'granted');
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    const registrations: Response[] = [];
    page.on('response', (response) => {
      if (
        response.request().method() === 'POST' &&
        response.url().endsWith('/api/v1/notifications/push-token')
      ) {
        registrations.push(response);
      }
    });
    await page.goto(paths.welcome);
    expect(
      await page.evaluate(() => ({
        origin: location.origin,
        permission: Notification.permission,
        secure: isSecureContext,
      })),
    ).toEqual({ origin: PWA_ORIGIN, permission: 'granted', secure: true });
    await seedSession(context, freshClient);
    expect(await page.evaluate(() => Notification.permission)).toBe('granted');
    expect(
      await api.expectOk<{ push_enabled: boolean }>(
        'push settings',
        api.get('/api/v1/notifications/settings', freshClient.tokens),
        200,
      ),
    ).toMatchObject({ push_enabled: true });
    await expect
      .poll(() =>
        page.evaluate(async () => ({
          permission: Notification.permission,
          secure: isSecureContext,
          pushManager: 'PushManager' in window,
          serviceWorker: 'serviceWorker' in navigator,
          registrations: navigator.serviceWorker
            ? (await navigator.serviceWorker.getRegistrations()).length
            : 0,
        })),
      )
      .toMatchObject({
        permission: 'granted',
        secure: true,
        pushManager: true,
        serviceWorker: true,
        registrations: 1,
      });
    expect(pageErrors).toEqual([]);
    await expect.poll(() => subscribeCalls(page)).toBe(1);
    await expect.poll(() => registrations.length).toBe(1);
    const [response] = registrations;
    expect(response.status()).toBe(200);
    expect(await subscribeCalls(page)).toBe(1);
    await page.goto(paths.settingsNotifications);
    await settleSettings(page);
    await expect(page.getByRole('heading', { name: 'Пуш-уведомления' })).toBeVisible();
    await expect(page.getByText('Уведомления включены')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Типы уведомлений' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Включить уведомления' })).toHaveCount(0);
    await expect(page.getByText(/Уведомления заблокированы в настройках браузера/)).toHaveCount(0);
    await expect(page.getByText(/Браузер ещё не спрашивал разрешение/)).toHaveCount(0);
    expect(await page.evaluate(() => Notification.permission)).toBe('granted');
  });
});
