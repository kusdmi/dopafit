import { seedSession } from '../fixtures/accounts.ts';
import { expect, test } from '../fixtures/test.ts';
import { paths } from '../support/paths.ts';

test('NAV-09 вкладки сохраняют подстраницу, поля и прокрутку @core @mobile', async ({
  context,
  freshClient,
}) => {
  const page = await seedSession(context, freshClient);
  const nav = page.getByRole('navigation', { name: 'Основная навигация' });
  await nav.getByRole('link', { name: 'Настройки' }).click();
  await page.getByRole('link', { name: 'Личные данные', exact: true }).click();
  await page.getByLabel('Город', { exact: true }).fill('Черновик города');
  await page.getByRole('main').evaluate((node) => {
    node.scrollTop = 200;
  });
  const top = await page.getByRole('main').evaluate((node) => node.scrollTop);
  await nav.getByRole('link', { name: 'Замеры' }).click();
  await page.getByLabel('Талия', { exact: true }).fill('81');
  await nav.getByRole('link', { name: 'Настройки' }).click();
  await expect(page).toHaveURL(new RegExp(`${paths.settingsProfile}$`));
  await expect(page.getByLabel('Город', { exact: true })).toHaveValue('Черновик города');
  await expect.poll(() => page.getByRole('main').evaluate((node) => node.scrollTop)).toBe(top);
  await nav.getByRole('link', { name: 'Замеры' }).click();
  await expect(page.getByLabel('Талия', { exact: true })).toHaveValue('81');
  await nav.getByRole('link', { name: 'Настройки' }).click();
  await page.getByRole('button', { name: 'Назад', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${paths.settings}$`));
});

test('NAV-10 повторный тап открывает начало раздела, плашка профиля открывает аккаунт @core @mobile', async ({
  context,
  freshClient,
}) => {
  const page = await seedSession(context, freshClient);
  await page.setViewportSize({ width: 390, height: 600 });
  const nav = page.getByRole('navigation', { name: 'Основная навигация' });
  await nav.getByRole('link', { name: 'Настройки' }).click();
  const account = page.getByRole('link', { name: 'Открыть данные аккаунта' });
  await expect(account).toBeVisible();
  await account.click();
  await expect(page).toHaveURL(new RegExp(`${paths.settingsProfile}$`));
  await nav.getByRole('link', { name: 'Настройки' }).click();
  await expect(page).toHaveURL(new RegExp(`${paths.settings}$`));
  await page.getByRole('main').evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  await expect
    .poll(() => page.getByRole('main').evaluate((node) => node.scrollTop))
    .toBeGreaterThan(0);
  await nav.getByRole('link', { name: 'Настройки' }).click();
  await expect.poll(() => page.getByRole('main').evaluate((node) => node.scrollTop)).toBe(0);
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${paths.settingsProfile}$`));
  await page.goForward();
  await expect(page).toHaveURL(new RegExp(`${paths.settings}$`));
});

for (const theme of ['light', 'dark']) {
  test(`UI-11 клавиатура скрывает меню без сжатия страницы: ${theme} @core @mobile`, async ({
    context,
    freshClient,
  }) => {
    await context.addInitScript(() => {
      const viewport = Object.assign(new EventTarget(), {
        height: 844,
        width: 390,
        offsetTop: 0,
        offsetLeft: 0,
        scale: 1,
      });
      Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
      const supports = CSS.supports.bind(CSS);
      CSS.supports = ((...args: [string, string?]) =>
        args[0] === '-webkit-touch-callout'
          ? true
          : supports(...(args as [string, string]))) as typeof CSS.supports;
      const match = window.matchMedia.bind(window);
      window.matchMedia = (query) =>
        query === '(display-mode: standalone)' ? { ...match(query), matches: true } : match(query);
      window.addEventListener('test-keyboard', (event) => {
        viewport.height = (event as CustomEvent<number>).detail;
        viewport.dispatchEvent(new Event('resize'));
      });
    });
    const page = await seedSession(context, freshClient);
    await page.goto(paths.exercises);
    await page.evaluate(
      (theme) => document.documentElement.setAttribute('data-theme', theme),
      theme,
    );
    const search = page.getByRole('searchbox', { name: 'Поиск упражнения' });
    await search.fill('жим');
    const main = page.getByRole('main');
    const before = await main.boundingBox();
    await page.evaluate(() =>
      window.dispatchEvent(new CustomEvent('test-keyboard', { detail: 450 })),
    );
    await expect(page.getByRole('navigation', { name: 'Основная навигация' })).toBeHidden();
    expect(await main.boundingBox()).toEqual(before);
    await expect(search).toHaveValue('жим');
    const searchBox = await search.boundingBox();
    expect(searchBox!.y + searchBox!.height).toBeLessThan(450);
    const all = page.getByRole('button', { name: 'Все', exact: true });
    const geometry = await all.evaluate((node) => {
      const pill = node.firstElementChild!;
      return {
        border: getComputedStyle(pill).borderBottomWidth,
        pillBottom: pill.getBoundingClientRect().bottom,
        rowBottom: node.parentElement!.getBoundingClientRect().bottom,
      };
    });
    expect(geometry.border).toBe('1px');
    expect(geometry.pillBottom).toBeLessThanOrEqual(geometry.rowBottom);
    await search.blur();
    await page.evaluate(() =>
      window.dispatchEvent(new CustomEvent('test-keyboard', { detail: 844 })),
    );
    const navigation = page.getByRole('navigation', { name: 'Основная навигация' });
    await expect(navigation).toBeVisible();
    expect(
      (await navigation.getByRole('link', { name: 'Главная' }).boundingBox())!.height,
    ).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: test.info().outputPath(`catalog-${theme}.png`) });
    await navigation.getByRole('link', { name: 'Настройки' }).click();
    await page.getByRole('link', { name: 'Открыть данные аккаунта' }).click();
    const city = page.getByRole('textbox', { name: 'Город', exact: true });
    await city.fill('Черновик');
    const profileBox = await main.boundingBox();
    await page.evaluate(() =>
      window.dispatchEvent(new CustomEvent('test-keyboard', { detail: 450 })),
    );
    await expect(navigation).toBeHidden();
    await expect
      .poll(async () => {
        const box = await city.boundingBox();
        return box!.y + box!.height;
      })
      .toBeLessThanOrEqual(434);
    expect(await main.boundingBox()).toEqual(profileBox);
    await city.blur();
    await page.evaluate(() =>
      window.dispatchEvent(new CustomEvent('test-keyboard', { detail: 844 })),
    );
    await expect(navigation).toBeVisible();
    await navigation.getByRole('link', { name: 'Тренировка' }).click();
    await expect(page).toHaveURL(new RegExp(`${paths.exercises}$`));
    await expect(page.getByRole('searchbox', { name: 'Поиск упражнения' })).toHaveValue('жим');
  });
}

test('OFF-12 одиночный сбой heartbeat не блокирует запрос кода @core', async ({
  page,
  freshClient,
}) => {
  let failNext = false;
  await page.route('**/api/v1/health', async (route) => {
    if (failNext) {
      failNext = false;
      await route.abort('failed');
    } else await route.continue();
  });
  const ready = page.waitForResponse('**/api/v1/health');
  await page.goto(paths.login);
  await ready;
  await page.getByRole('textbox', { name: 'Email' }).fill(freshClient.user.email!);
  failNext = true;
  const failure = page.waitForEvent('requestfailed', (request) =>
    request.url().endsWith('/api/v1/health'),
  );
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await failure;
  await expect(page.getByRole('button', { name: 'Получить код' })).toBeEnabled();
  const sent = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().endsWith('/api/v1/auth/login/request-code'),
  );
  await page.getByRole('button', { name: 'Получить код' }).click();
  expect((await sent).status()).toBe(200);
  await expect(page.getByRole('status', { name: 'Отправка кода' })).toContainText(
    freshClient.user.email!,
  );
  await expect(page.getByRole('button', { name: 'Офлайн-режим' })).toHaveCount(0);
});
