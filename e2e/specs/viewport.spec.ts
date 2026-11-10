import type { Page } from '@playwright/test';

import { createMeasurement, createProgram } from '../fixtures/data.ts';
import { seedSession } from '../fixtures/accounts.ts';
import { expect, test } from '../fixtures/test.ts';
import { paths, programStart, programSession } from '../support/paths.ts';

for (const theme of ['light', 'dark'] as const) {
  test(`UI-12 фон экрана непрерывен, нажатие вкладки ограничено плиткой: ${theme} @mobile`, async ({
    context,
    freshClient,
    api,
  }) => {
    await api.expectOk(
      'prepare theme',
      api.put('/api/v1/users/me/settings', freshClient.tokens, { theme }),
    );
    const page = await seedSession(context, freshClient);
    await page.goto(paths.analytics);
    await expect(page.getByRole('heading', { name: 'Аналитика прогресса' })).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.getAttribute('data-theme')))
      .toBe(theme);
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--safe-area-bottom', '34px');
    });
    const main = page.getByRole('main');
    const backgrounds = await main.evaluate((node) => {
      const root = getComputedStyle(document.documentElement);
      const body = getComputedStyle(document.body);
      const screen = getComputedStyle(node.parentElement!);
      return {
        root: root.backgroundImage,
        body: body.backgroundImage,
        screen: screen.backgroundImage,
        rootColor: root.backgroundColor,
        bodyColor: body.backgroundColor,
      };
    });
    expect(backgrounds.screen).toContain('linear-gradient');
    expect(backgrounds.root).toBe(backgrounds.screen);
    expect(backgrounds.body).toBe(backgrounds.screen);
    expect(backgrounds.rootColor).toBe(backgrounds.bodyColor);
    const nav = page.getByRole('navigation', { name: 'Основная навигация' });
    const link = nav.getByRole('link', { name: 'Главная' });
    const box = (await link.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect
      .poll(() =>
        link.evaluate((node) => Number(getComputedStyle(node.firstElementChild!).opacity)),
      )
      .toBeLessThan(1);
    const press = await link.evaluate((node) => {
      const style = getComputedStyle(node);
      const tile = getComputedStyle(node.firstElementChild!);
      return {
        active: node.matches(':active'),
        background: style.backgroundImage,
        color: style.backgroundColor,
        opacity: Number(tile.opacity),
        radius: parseFloat(tile.borderRadius),
        highlight: style.getPropertyValue('-webkit-tap-highlight-color'),
      };
    });
    expect(press.active).toBe(true);
    expect(press.background).toBe('none');
    expect(press.color).toBe('rgba(0, 0, 0, 0)');
    expect(press.opacity).toBeLessThan(1);
    expect(press.radius).toBeGreaterThan(0);
    expect(press.highlight).toBe('rgba(0, 0, 0, 0)');
    await page.screenshot({ path: test.info().outputPath(`tab-pressed-${theme}.png`) });
    await page.mouse.up();
    await expect(page).toHaveURL(paths.home);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await link.focus();
    await page.keyboard.press('Tab');
    const focused = nav.getByRole('link', { name: 'Замеры' });
    await expect(focused).toBeFocused();
    const focus = await focused.evaluate((node) => {
      const tile = getComputedStyle(node.firstElementChild!);
      return {
        outline: tile.outlineStyle,
        width: tile.outlineWidth,
        transition: tile.transitionDuration,
      };
    });
    expect(focus.outline).toBe('solid');
    expect(parseFloat(focus.width)).toBeGreaterThanOrEqual(2);
    expect(focus.transition).toBe('0s');
    await page.keyboard.down('Enter');
    await page.keyboard.up('Enter');
    await expect(page).toHaveURL(paths.measurements);
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`UI-08 каркас и нижняя навигация заполняют экран: ${theme} @mobile`, async ({
    context,
    freshClient,
  }) => {
    const page = await seedSession(context, freshClient);
    await page.goto(paths.home);
    await expect(page.getByRole('heading', { name: 'Календарь' })).toBeVisible();
    await page.evaluate((theme) => {
      document.documentElement.setAttribute('data-theme', theme);
      document.documentElement.style.setProperty('--safe-area-bottom', '34px');
    }, theme);

    // Model WebKit reporting a dvh shorter than the actual app bounds, then
    // a keyboard-sized viewport. All chrome must use the same containing box.
    for (const height of [868, 500, 844]) {
      await page.evaluate((height) => {
        document.documentElement.style.setProperty('--app-height', `${height}px`);
      }, height);
      const main = page.getByRole('main');
      await expect
        .poll(() => main.evaluate((node) => node.getBoundingClientRect().bottom))
        .toBe(height);
      const navigation = page.getByRole('navigation', { name: 'Основная навигация' });
      const navBox = await navigation.boundingBox();
      expect(navBox!.y + navBox!.height).toBe(height);
      const link = navigation.getByRole('link', { name: 'Главная' });
      const linkBox = await link.boundingBox();
      expect(linkBox!.y + linkBox!.height).toBeLessThanOrEqual(height - 34);
      await main.evaluate((node) => {
        node.scrollTop = node.scrollHeight;
      });
      await expect.poll(() => main.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      await main.evaluate((node) => {
        node.scrollTop = 0;
      });
    }

    await page
      .getByRole('navigation', { name: 'Основная навигация' })
      .getByRole('link', { name: 'Настройки' })
      .click();
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--app-height', '500px');
    });
    await page.getByRole('button', { name: 'Выйти' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(
      await page
        .getByRole('dialog')
        .evaluate((node) => node.parentElement!.getBoundingClientRect().bottom),
    ).toBe(500);
    await page.keyboard.press('Escape');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Настройки' })).toBeVisible();
    const bottom = await page
      .getByRole('main')
      .evaluate((node) => node.getBoundingClientRect().bottom);
    expect(bottom).toBe(844);
  });
}

async function bottomContentIsReachable(page: Page, path: string, heading: string) {
  const labels: Record<string, string> = {
    [paths.home]: 'Главная',
    [paths.measurements]: 'Замеры',
    [paths.programs]: 'Тренировка',
    [paths.analytics]: 'Аналитика',
    [paths.settings]: 'Настройки',
  };
  const link = page
    .getByRole('navigation', { name: 'Основная навигация' })
    .getByRole('link', { name: labels[path] });
  const destination = await link.getAttribute('href');
  await link.click();
  await page.waitForURL((url) => url.pathname === new URL(destination!, url.origin).pathname);
  if (new URL(page.url()).pathname !== path) await link.click();
  await expect(page.getByRole('heading', { name: heading })).toBeVisible();
  if (path === paths.measurements) {
    await expect(page.getByRole('button', { name: /Замер за/ }).last()).toBeVisible();
  }
  const main = page.getByRole('main');
  await expect(main.locator(':scope > div').first()).toBeVisible();
  await main.evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  await expect
    .poll(
      () =>
        main.evaluate((node) => {
          node.scrollTop = node.scrollHeight;
          const content = node.firstElementChild!.getBoundingClientRect();
          const nav = document.querySelector('.bottom-nav__bar')!.getBoundingClientRect();
          const plate = document.querySelector('[aria-label="Тренировка идёт: Я"]');
          const top = plate ? Math.min(nav.top, plate.getBoundingClientRect().top) : nav.top;
          return top - content.bottom;
        }),
      { message: `Last content clears navigation: ${path}` },
    )
    .toBeGreaterThanOrEqual(8);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
}

for (const role of ['client', 'trainer'] as const) {
  test(`UI-10 конец страниц доступен над нижним меню: ${role} @mobile`, async ({
    context,
    freshClient,
    freshTrainer,
    api,
  }) => {
    const session = role === 'trainer' ? freshTrainer : freshClient;
    await createMeasurement(api, session);
    const page = await seedSession(context, session);
    const prepared = await createProgram(api, session, test.info().testId);
    for (const active of [false, true]) {
      if (active) {
        await page.goto(programStart(prepared.programId));
        await page.getByRole('button', { name: 'День 1' }).click();
        await page.getByRole('button', { name: 'Старт', exact: true }).click();
        await expect(page).toHaveURL(programSession(prepared.programId));
      }
      for (const theme of ['light', 'dark']) {
        await page.evaluate((theme) => {
          document.documentElement.setAttribute('data-theme', theme);
          document.documentElement.style.setProperty('--safe-area-bottom', '34px');
          document.documentElement.style.setProperty('--app-height', '500px');
        }, theme);
        for (const [path, heading] of [
          [paths.measurements, 'Данные антропометрии'],
          [paths.settings, 'Настройки'],
          [paths.home, 'Календарь'],
          [paths.analytics, 'Аналитика прогресса'],
          [paths.programs, 'Программы тренировок'],
        ]) {
          await bottomContentIsReachable(page, path, heading);
        }
      }
    }
  });
}
