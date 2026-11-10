import type { Locator, Page } from '@playwright/test';

import { seedSession } from '../fixtures/accounts.ts';
import { createMeasurement } from '../fixtures/data.ts';
import { expect, test } from '../fixtures/test.ts';
import { paths } from '../support/paths.ts';

async function contrastToSurface(
  locator: Locator,
  part: 'color' | 'stroke' | 'fill' = 'color',
): Promise<number> {
  return locator.evaluate((node, part) => {
    const sample = document.createElement('span');
    sample.style.color = 'var(--surface)';
    document.body.append(sample);
    const background = getComputedStyle(sample).color;
    const target =
      part === 'stroke'
        ? node.getElementsByTagName('polyline')[0]
        : part === 'fill'
          ? node.getElementsByTagName('text')[0]
          : node;
    if (!target) throw new Error(`Chart has no ${part} element`);
    const foreground = getComputedStyle(target)[part];
    sample.remove();
    const luminance = (color: string): number => {
      const rgb = (color.match(/\d+(?:\.\d+)?/g) ?? []).slice(0, 3).map(Number);
      const linear = rgb.map((value) => {
        const s = value / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    };
    const a = luminance(foreground);
    const b = luminance(background);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }, part);
}

async function viewportHasNoOverflow(page: Page): Promise<void> {
  for (const [path, heading] of [
    [paths.home, 'Календарь'],
    [paths.programs, 'Программы тренировок'],
    [paths.measurements, 'Данные антропометрии'],
    [paths.analytics, 'Аналитика прогресса'],
    [paths.settings, 'Настройки'],
  ]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize()!.width,
    );
    expect(await page.getByRole('main').evaluate((main) => main.scrollWidth)).toBeLessThanOrEqual(
      await page.getByRole('main').evaluate((main) => main.clientWidth),
    );
    await expect(page.getByRole('navigation', { name: 'Основная навигация' })).toBeVisible();
  }
  await page.goto(paths.measurements);
  const field = page.getByLabel('Вес', { exact: true });
  await field.focus();
  await expect(field).toBeVisible();
  const box = await field.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
}

test.describe('N. UI, доступность и устойчивость', () => {
  test('UI-01 формы и диалог доступны с клавиатуры @core', async ({ context, freshClient }) => {
    const page = await seedSession(context, freshClient);
    await page.goto(paths.measurements);
    const weight = page.getByLabel('Вес', { exact: true });
    await weight.press('Tab');
    const waist = page.getByLabel('Талия', { exact: true });
    await expect(waist).toBeFocused();
    expect(await page.evaluate(() => document.activeElement?.matches(':focus-visible'))).toBe(true);
    await waist.press('8');
    await waist.press('5');
    await expect(waist).toHaveValue('85');
    await page.goto(paths.settings);
    await page.getByRole('button', { name: 'Выйти' }).press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Настройки' })).toBeVisible();
  });

  test('UI-02 программы, замеры, настройки и уведомления имеют имена и состояния @core', async ({
    context,
    freshClient,
  }) => {
    const page = await seedSession(context, freshClient);
    await page.goto(paths.programs);
    const standard = page.getByRole('tab', { name: 'Стандартные программы' });
    const own = page.getByRole('tab', { name: 'Мои программы' });
    await expect(standard).toHaveAttribute('aria-selected', 'true');
    await own.click();
    await expect(own).toHaveAttribute('aria-selected', 'true');
    await page.goto(paths.measurements);
    await expect(page.getByLabel('Вес', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Замер за/ })).toBeVisible();
    await page.goto(paths.settingsTheme);
    await expect(page.getByRole('button', { name: /Светлая/ })).toHaveAttribute(
      'aria-pressed',
      /true|false/,
    );
    await page.goto(paths.home);
    await page.getByRole('button', { name: 'Уведомления' }).click();
    await expect(page.getByRole('heading', { name: 'Уведомления' })).toBeVisible();
  });

  test('UI-03 критические экраны и поле замера помещаются на 320 px @core @narrow', async ({
    context,
    freshClient,
  }) => {
    await viewportHasNoOverflow(await seedSession(context, freshClient));
  });

  test('UI-03 критические экраны помещаются на 390 px @core @mobile', async ({
    context,
    freshClient,
  }) => {
    await viewportHasNoOverflow(await seedSession(context, freshClient));
  });

  test('UI-03 критические экраны помещаются на 430 px @core @large', async ({
    context,
    freshClient,
  }) => {
    await viewportHasNoOverflow(await seedSession(context, freshClient));
  });

  test('UI-04 ошибка и недоступное действие читаются в трёх темах @core', async ({
    context,
    freshClient,
  }) => {
    const page = await seedSession(context, freshClient);
    let failTheme = false;
    await page.route('**/api/v1/users/me/settings', async (route) => {
      if (route.request().method() === 'PUT' && failTheme) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{"code":"unavailable","message":"Temporary error"}',
        });
      } else {
        await route.continue();
      }
    });
    for (const [label, effective] of [
      ['Светлая', 'light'],
      ['Тёмная', 'dark'],
      ['Системная', 'system'],
    ] as const) {
      await page.goto(paths.settingsTheme);
      await page.getByRole('button', { name: new RegExp(`^${label}`) }).click();
      await expect(page.getByText('Тема сохранена')).toBeVisible();
      failTheme = true;
      await page.getByRole('button', { name: new RegExp(`^${label}`) }).click();
      await expect(page.getByRole('alert')).toBeVisible();
      if (effective === 'system') {
        await expect
          .poll(() => page.evaluate(() => document.documentElement.getAttribute('data-theme')))
          .toBeNull();
      } else {
        await expect
          .poll(() => page.evaluate(() => document.documentElement.getAttribute('data-theme')))
          .toBe(effective);
      }
      expect(await contrastToSurface(page.getByRole('alert'))).toBeGreaterThanOrEqual(3);
      await page.goto(paths.measurements);
      await page.getByLabel('Вес', { exact: true }).fill('10000');
      const validation = page.getByText('Максимум 9999,9', { exact: true });
      await expect(validation).toBeVisible();
      expect(await contrastToSurface(validation)).toBeGreaterThanOrEqual(3);
      await page.screenshot({ path: test.info().outputPath(`validation-${effective}.png`) });
      await page.goto(paths.settingsSubscription);
      await expect(
        page.getByRole('button', { name: 'Подключить Premium бесплатно' }),
      ).toBeVisible();
      await context.setOffline(true);
      const unavailable = page.getByRole('button', { name: 'Подключить Premium бесплатно' });
      await expect(unavailable).toBeDisabled();
      expect(await contrastToSurface(unavailable)).toBeGreaterThanOrEqual(3);
      await context.setOffline(false);
      failTheme = false;
    }
  });

  test('UI-04 линия и подписи графика читаются в трёх темах @core', async ({
    context,
    freshClient,
    api,
  }) => {
    await createMeasurement(api, freshClient);
    const page = await seedSession(context, freshClient);
    for (const label of ['Светлая', 'Тёмная', 'Системная']) {
      await page.goto(paths.settingsTheme);
      await page.getByRole('button', { name: new RegExp(`^${label}`) }).click();
      await expect(page.getByText('Тема сохранена')).toBeVisible();
      await page.goto(paths.analytics);
      await page.getByRole('tab', { name: 'Антропометрия' }).click();
      await page.getByLabel('Период анализа: начало').fill('2020-01-01');
      const notice = page.getByRole('note', { name: 'Бесплатная аналитика' });
      await expect(notice).toBeVisible();
      await expect
        .poll(() =>
          notice.evaluate((node) => {
            let opacity = 1;
            for (let parent: Element | null = node; parent; parent = parent.parentElement)
              opacity *= Number(getComputedStyle(parent).opacity);
            return opacity;
          }),
        )
        .toBe(1);
      const noticeTitle = notice.getByText('Бесплатная аналитика за последние 30 дней');
      expect.soft(await contrastToSurface(noticeTitle), label).toBeGreaterThanOrEqual(4.5);
      await expect(notice).not.toContainText(/\d{4}-\d{2}-\d{2}/);
      await page.screenshot({
        path: test.info().outputPath(`analytics-${label}.png`),
        fullPage: true,
        animations: 'disabled',
      });
      const chart = page.getByRole('img').first();
      await expect(chart).toBeVisible();
      // WCAG non-text contrast for the series; axis labels are small text.
      expect.soft(await contrastToSurface(chart, 'stroke'), label).toBeGreaterThanOrEqual(3);
      expect.soft(await contrastToSurface(chart, 'fill'), label).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('UI-05 ошибка чтения показывает повтор и сохраняет форму @core', async ({
    context,
    freshClient,
  }) => {
    const page = await seedSession(context, freshClient);
    let fail = true;
    await page.route('**/api/v1/notifications**', async (route) => {
      if (fail) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{"code":"unavailable","message":"Temporary error"}',
        });
      } else {
        await route.continue();
      }
    });
    await page.goto(paths.homeNotifications);
    await expect(page.getByText('Не удалось загрузить уведомления')).toBeVisible({
      timeout: 15_000,
    });
    fail = false;
    await expect(page.getByRole('button', { name: 'Повторить' })).toBeVisible();
    await page.getByRole('button', { name: 'Повторить' }).click();
    await expect(page.getByText('Нет новых уведомлений')).toBeVisible();
  });

  test('UI-05 ошибка сохранения оставляет введённое обращение @core', async ({
    context,
    freshClient,
  }) => {
    const page = await seedSession(context, freshClient);
    await page.goto(paths.support);
    await page.getByRole('textbox', { name: 'Тема обращения' }).fill('Вопрос после ошибки');
    await page.getByRole('textbox', { name: 'Сообщение' }).fill('Текст остаётся после 503');
    await page.route('**/api/v1/support/tickets', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"code":"unavailable","message":"Temporary error"}',
      }),
    );
    await page.getByRole('button', { name: 'Отправить' }).click();
    await expect(page.getByText('Не удалось отправить обращение')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('textbox', { name: 'Тема обращения' })).toHaveValue(
      'Вопрос после ошибки',
    );
    await expect(page.getByRole('textbox', { name: 'Сообщение' })).toHaveValue(
      'Текст остаётся после 503',
    );
  });

  test('UI-06 медленная загрузка не показывает пустое приветствие @core', async ({
    context,
    freshClient,
    runId,
  }) => {
    const page = await context.newPage();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started!: () => void;
    const requested = new Promise<void>((resolve) => {
      started = resolve;
    });
    await page.route('**/api/v1/analytics/dashboard**', async (route) => {
      started();
      await gate;
      await route.continue();
    });
    try {
      await seedSession(context, freshClient);
      await requested;
      await expect(page.getByText('—', { exact: true }).first()).toBeVisible();
      // Заголовок с запятой и восклицательным знаком без имени выглядит как ошибка.
      await expect(page.getByText(/Добрый[^!]*, !/)).toHaveCount(0);
    } finally {
      release();
    }
    await expect(page.getByText(new RegExp(`Клиент ${runId}`))).toBeVisible();
  });

  test('UI-06 медленная мутация не создаёт дубль и снимает загрузку @core', async ({
    context,
    freshClient,
    freshTrainer,
    api,
  }) => {
    const page = await seedSession(context, freshClient);
    await page.goto(paths.connections);
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const requested = new Promise<void>((resolve) => {
      started = resolve;
    });
    let requests = 0;
    await page.route('**/api/v1/link-requests', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      requests += 1;
      started();
      await gate;
      await route.continue();
    });
    await page.getByRole('textbox', { name: 'Телефон или email' }).fill(freshTrainer.user.email!);
    try {
      await page.getByRole('button', { name: 'Отправить запрос' }).click();
      await requested;
      await expect(page.getByRole('status', { name: 'Загрузка' })).toBeVisible();
      await page.keyboard.press('Enter');
      expect(requests).toBe(1);
    } finally {
      release();
    }
    await page.getByRole('tab', { name: 'Мои запросы' }).click();
    await expect(page.getByRole('button', { name: 'Отменить запрос' })).toHaveCount(1);
    await expect(page.getByRole('status', { name: 'Загрузка' })).toHaveCount(0);
    expect(requests).toBe(1);
    const outgoing = await api.expectOk<{ status: string }[]>(
      'outgoing requests',
      api.get('/api/v1/link-requests?direction=outgoing', freshClient.tokens),
      200,
    );
    expect(outgoing.filter((r) => r.status === 'pending')).toHaveLength(1);
  });
});

test.describe('Day-first dates', () => {
  test.use({ locale: 'en-US' });

  test('UI-07 даты сохраняют формат СНГ при другой локали браузера @narrow', async ({
    context,
    freshClient,
  }) => {
    const page = await seedSession(context, freshClient);
    await page.goto(paths.measurements);
    await page.getByLabel('Дата').fill('2026-03-04');
    await expect(page.getByText('04.03.2026', { exact: true })).toBeVisible();
    // A native date has separate day/month/year keyboard segments.
    await page.getByLabel('Дата').focus();
    for (let step = 0; step < 8; step += 1) {
      await page.keyboard.press('Tab');
      if (
        await page
          .getByLabel('Рост', { exact: true })
          .evaluate((node) => node === document.activeElement)
      )
        break;
    }
    await expect(page.getByLabel('Рост', { exact: true })).toBeFocused();
    await page.goto(paths.analytics);
    await page.getByRole('tab', { name: 'Антропометрия' }).click();
    await page.getByLabel('Период анализа: начало').fill('2026-03-04');
    const visibleDate = page.getByText('04.03.2026', { exact: true });
    await expect(visibleDate).toBeVisible();
    expect(await visibleDate.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      320,
    );
    await page.screenshot({
      path: test.info().outputPath('dates-en-locale.png'),
      animations: 'disabled',
    });
  });
});
