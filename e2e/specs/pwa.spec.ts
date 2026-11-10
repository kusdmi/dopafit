import type { Page } from '@playwright/test';

import { seedSession } from '../fixtures/accounts.ts';
import { expect, test } from '../fixtures/test.ts';
import { paths, program, programSession } from '../support/paths.ts';

interface WebManifest {
  name: string;
  start_url: string;
  scope?: string;
  display: string;
  icons: { src: string; sizes: string; type: string; purpose?: string }[];
}

async function controlledByServiceWorker(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker?.controller)), {
      timeout: 15_000,
    })
    .toBe(true);
}

test.describe('J. PWA и сервис-воркер', () => {
  test('PWA-01 manifest, иконки и service worker доступны в Chrome @core @pwa', async ({
    context,
    freshClient,
  }) => {
    const page = await context.newPage();
    const registrationErrors: string[] = [];
    page.on('pageerror', (error) => registrationErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && /service.?worker|manifest/i.test(message.text())) {
        registrationErrors.push(message.text());
      }
    });
    await seedSession(context, freshClient);
    const html = await page.request.get(paths.root);
    expect(html.status()).toBe(200);
    expect(await html.text()).not.toContain('<!--');
    const manifestUrl = await page.evaluate(
      () =>
        Array.from(document.getElementsByTagName('link')).find((link) => link.rel === 'manifest')
          ?.href,
    );
    expect(manifestUrl).toBeTruthy();
    const manifestResponse = await page.request.get(manifestUrl!);
    expect(manifestResponse.status()).toBe(200);
    const manifest = (await manifestResponse.json()) as WebManifest;
    expect(manifest.name).toBe('DopaFit');
    const appOrigin = new URL(page.url()).origin;
    expect(new URL(manifest.start_url, manifestUrl).origin).toBe(appOrigin);
    expect(new URL(manifest.scope ?? paths.root, manifestUrl).origin).toBe(appOrigin);
    expect(new URL(manifest.start_url, manifestUrl).pathname).toBe(paths.root);
    expect(new URL(manifest.scope ?? paths.root, manifestUrl).pathname).toBe(paths.root);
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sizes: '192x192', type: 'image/png' }),
        expect.objectContaining({ sizes: '512x512', type: 'image/png' }),
        expect.objectContaining({ sizes: '512x512', purpose: 'maskable' }),
      ]),
    );
    for (const icon of manifest.icons) {
      const response = await page.request.get(new URL(icon.src, manifestUrl).toString());
      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toContain('image/png');
    }
    await controlledByServiceWorker(page);
    const registration = await page.evaluate(async () => {
      const current = await navigator.serviceWorker.getRegistration();
      return current?.active ? { scope: current.scope, scriptURL: current.active.scriptURL } : null;
    });
    expect(registration).not.toBeNull();
    expect(new URL(registration!.scope).pathname).toBe(paths.root);
    expect(new URL(registration!.scriptURL).origin).toBe(new URL(page.url()).origin);
    expect(registrationErrors).toEqual([]);
    const release = await page.request.get('/version.json');
    expect(release.status()).toBe(200);
    const build = (await release.json()) as { buildId: string };
    expect(build.buildId).toMatch(/^[a-zA-Z0-9-]{8,100}$/);
    const workerBuild = await page.evaluate(async () => {
      const channel = new MessageChannel();
      return new Promise<string>((resolve) => {
        channel.port1.onmessage = (event) => {
          channel.port1.close();
          resolve(event.data);
        };
        navigator.serviceWorker.controller!.postMessage({ type: 'DOPAFIT_GET_BUILD' }, [
          channel.port2,
        ]);
      });
    });
    expect(workerBuild).toBe(build.buildId);
    const cachedManifest = await page.evaluate(async () => {
      for (const key of await caches.keys()) {
        if (await (await caches.open(key)).match('/version.json', { ignoreSearch: true }))
          return true;
      }
      return false;
    });
    expect(cachedManifest).toBe(false);
  });

  test('PWA-02 вложенный маршрут перезагружается офлайн после предварительной загрузки @smoke @pwa', async ({
    context,
    freshClient,
  }) => {
    const page = await seedSession(context, freshClient);
    await page.goto(paths.settingsTheme);
    await expect(page.getByRole('heading', { name: 'Оформление' })).toBeVisible();
    await controlledByServiceWorker(page);
    await context.setOffline(true);
    try {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(paths.settingsTheme);
      await expect(page.getByRole('heading', { name: 'Оформление' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Офлайн-режим' })).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
  });

  test('PWA-03 после офлайн-перезагрузки возвращаются маршрут и черновик тренировки @core @pwa', async ({
    context,
    freshClient,
    programFixture,
  }) => {
    const route = programSession(programFixture.programId);
    const page = await seedSession(context, freshClient);
    await page.goto(program(programFixture.programId));
    await page.getByRole('button', { name: 'Начать тренировку' }).click();
    await expect(page.getByRole('heading', { name: 'Выбор дня' })).toBeVisible();
    await page.getByRole('button', { name: 'День 1' }).click();
    await page.getByRole('button', { name: 'Старт', exact: true }).click();
    await expect(page).toHaveURL(route);
    await controlledByServiceWorker(page);
    await context.setOffline(true);
    await expect(page.getByRole('button', { name: 'Офлайн-режим' })).toBeVisible();
    await page.getByLabel('КГ', { exact: true }).fill('46');
    await page.getByRole('spinbutton', { name: 'Повторы' }).fill('8');
    await page.getByRole('button', { name: 'Добавить', exact: true }).click();
    await expect(page.getByRole('button', { name: '46 кг × 8' })).toBeVisible();
    try {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 10_000 });
      await expect(page).toHaveURL(route);
      await expect(page.getByRole('button', { name: '46 кг × 8' })).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
    await page.reload();
    await expect(page).toHaveURL(route);
    await expect(page.getByRole('button', { name: '46 кг × 8' })).toBeVisible();
  });
});

test('PWA-08 браузер без SW обнаруживает релиз и обновляется после подтверждения @core @pwa', async ({
  browser,
  freshClient,
}, testInfo) => {
  const context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    serviceWorkers: 'block',
    locale: 'ru-RU',
  });
  try {
    const page = await seedSession(context, freshClient);
    await page.clock.install();
    await page.goto(paths.settingsProfile);
    await page.getByLabel('Город', { exact: true }).fill('Черновик перед обновлением');
    await page.route('**/version.json', (route) =>
      route.fulfill({ json: { buildId: 'e2e-next-release' } }),
    );
    const checked = page.waitForResponse('**/version.json');
    // Trigger the production interval deterministically; no fixed sleep in the test.
    await page.clock.fastForward(5 * 60_000);
    await checked;
    const notice = page.getByRole('complementary', { name: 'Обновление приложения' });
    await expect(notice).toBeVisible();
    await expect(page.getByLabel('Город', { exact: true })).toHaveValue(
      'Черновик перед обновлением',
    );
    await notice.getByRole('button', { name: 'Обновить' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Позже' }).click();
    await expect(page.getByLabel('Город', { exact: true })).toHaveValue(
      'Черновик перед обновлением',
    );
    await notice.getByRole('button', { name: 'Обновить' }).click();
    const reload = page.waitForEvent('framenavigated', (frame) => frame === page.mainFrame());
    await page.getByRole('dialog').getByRole('button', { name: 'Обновить' }).click();
    await reload;
    await expect(page).toHaveURL(paths.settingsProfile);
    await expect(page.getByRole('heading', { name: 'Личные данные' })).toBeVisible();
    // The simulated server still returns the old HTML: the retry guard must stop a loop.
    await expect(notice).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => sessionStorage.getItem('dopafit.release-reload')))
      .toBe('e2e-next-release');
  } finally {
    await context.close();
  }
});

for (const installed of [false, true]) {
  test(`PWA-07 рекомендация установки и инструкция: ${installed ? 'установленное приложение' : 'браузер'} @core @pwa`, async ({
    context,
    freshClient,
  }) => {
    await context.addInitScript((installed) => {
      Object.defineProperty(navigator, 'userAgent', {
        configurable: true,
        get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)',
      });
      Object.defineProperty(navigator, 'standalone', { configurable: true, value: installed });
    }, installed);
    const page = await context.newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.clock.install();
    await seedSession(context, freshClient);
    await expect(page.getByRole('heading', { name: 'Календарь', exact: true })).toBeVisible();
    await page.clock.fastForward(20_000);
    const hint = page.getByRole('complementary', { name: 'Установка DopaFit' });
    if (installed) {
      await expect(hint).toHaveCount(0);
      await page.goto(paths.settingsInstall);
      await expect(page.getByRole('status')).toContainText('установленное приложение');
      return;
    }
    await expect(hint).toBeVisible();
    await hint.getByRole('link').click();
    await expect(page).toHaveURL(paths.settingsInstall);
    const guide = page.getByRole('region', { name: 'Пошаговая инструкция' });
    await expect(guide.getByRole('heading', { name: 'Откройте DopaFit в Safari' })).toBeVisible();
    await guide.getByRole('button', { name: 'Далее' }).click();
    await expect(guide.getByRole('heading', { name: 'Откройте меню «Поделиться»' })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('install-ios.png') });
    await page.getByRole('button', { name: 'Android', exact: true }).click();
    await expect(guide.getByRole('heading', { name: 'Откройте DopaFit в Chrome' })).toBeVisible();
    expect(
      await page.getByRole('main').evaluate((node) => node.scrollWidth <= node.clientWidth),
    ).toBe(true);
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await page.screenshot({ path: test.info().outputPath('install-android-dark.png') });
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    const nav = page.getByRole('navigation', { name: 'Основная навигация' });
    await nav.getByRole('link', { name: 'Настройки' }).click();
    await page.getByRole('link', { name: 'Установить DopaFit', exact: true }).click();
    await expect(page).toHaveURL(paths.settingsInstall);
    await nav.getByRole('link', { name: 'Главная' }).click();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Календарь', exact: true })).toBeVisible();
    await page.clock.fastForward(20_000);
    await expect(hint).toHaveCount(0);
  });
}
