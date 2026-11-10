import type { Browser, BrowserContext, Page } from '@playwright/test';

import { registerClient, seedSession } from '../fixtures/accounts.ts';
import type { Session } from '../fixtures/accounts.ts';
import type { Api } from '../fixtures/api.ts';
import { createProgram } from '../fixtures/data.ts';
import type { ProgramFixture } from '../fixtures/data.ts';
import { expect, test } from '../fixtures/test.ts';
import { ProgramEditor } from '../pages/program-editor.ts';
import { paths, program, programEdit, programSession, programStart } from '../support/paths.ts';

interface MeasurementPage {
  items: { id: string; date: string; weight: number | null; waist: number | null }[];
}

interface ProgramOut {
  id: string;
  name: string;
}

function day(offset: number): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value);
  return new Date(Date.UTC(part('year'), part('month') - 1, part('day') + offset))
    .toISOString()
    .slice(0, 10);
}

async function measurements(api: Api, actor: Session): Promise<MeasurementPage> {
  return api.expectOk<MeasurementPage>(
    'list client measurements',
    api.get('/api/v1/measurements', actor.tokens),
    200,
  );
}

async function savedProgram(api: Api, actor: Session, id: string): Promise<ProgramOut> {
  return api.expectOk<ProgramOut>(
    'read saved program',
    api.get(`/api/v1/programs/${id}`, actor.tokens),
    200,
  );
}

async function offline(context: BrowserContext, page: Page): Promise<void> {
  await context.setOffline(true);
  await expect(page.getByRole('button', { name: 'Офлайн-режим' })).toBeVisible();
}

async function online(context: BrowserContext, page: Page): Promise<void> {
  await context.setOffline(false);
  await expect(page.getByRole('button', { name: 'Офлайн-режим' })).toHaveCount(0);
}

async function startWorkout(page: Page, fixture: ProgramFixture): Promise<void> {
  await page.goto(program(fixture.programId));
  await page.getByRole('button', { name: 'Начать тренировку' }).click();
  await expect(page).toHaveURL(programStart(fixture.programId));
  await expect(page.getByRole('heading', { name: /Выбор дня|Выбор тренирующегося/ })).toBeVisible();
  await page.getByRole('button', { name: 'День 1' }).click();
  await page.getByRole('button', { name: 'Старт', exact: true }).click();
  await expect(page).toHaveURL(programSession(fixture.programId));
}

async function addSet(page: Page, weight: number, reps: number): Promise<void> {
  await page.getByLabel('КГ', { exact: true }).fill(String(weight));
  await page.getByRole('spinbutton', { name: 'Повторы' }).fill(String(reps));
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  await expect(page.getByRole('button', { name: `${weight} кг × ${reps}` })).toBeVisible();
}

async function finishWorkout(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Завершить тренировку' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Завершить', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Итоги тренировки/ })).toBeVisible();
}

async function workoutCount(api: Api, actor: Session, variantId: string): Promise<number> {
  const result = await api.expectOk<{ days: { entries: unknown[] }[] }>(
    'read exercise history',
    api.get(`/api/v1/workouts/history/by-variant/${variantId}`, actor.tokens),
    200,
  );
  return result.days.reduce((count, entry) => count + entry.entries.length, 0);
}

function extraContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({
    baseURL: process.env.E2E_BASE_URL ?? 'http://frontend-e2e:5173',
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
  });
}

/** Раздел I: проверяем реальный браузерный outbox, а сервер читаем отдельным API-клиентом. */
test.describe('I. Офлайн и синхронизация', () => {
  test('OFF-11 сетевая ошибка API запускает проверку сразу, восстановление возвращает каталог @core', async ({
    context,
    freshClient,
  }) => {
    const page = await seedSession(context, freshClient);
    let unavailable = false;
    let probes = 0;
    await page.route('**/api/v1/**', async (route) => {
      if (new URL(route.request().url()).pathname.endsWith('/health')) probes++;
      if (unavailable) await route.abort('failed');
      else await route.continue();
    });
    const ready = page.waitForResponse('**/api/v1/health');
    await page.goto(paths.programs);
    await ready;
    const catalog = page.getByRole('link', { name: 'Все упражнения' });
    await expect(catalog).toBeVisible();
    const before = probes;
    unavailable = true;
    await catalog.click();
    await expect(page.getByRole('button', { name: 'Офлайн-режим' })).toBeVisible({
      timeout: 2_000,
    });
    expect(probes).toBeGreaterThan(before);
    await expect(page.getByRole('heading', { name: 'Все упражнения', exact: true })).toBeVisible();
    unavailable = false;
    await expect(page.getByRole('button', { name: 'Офлайн-режим' })).toHaveCount(0, {
      timeout: 15_000,
    });
    await expect(page.getByText(/^Найдено: \d+$/)).toBeVisible();
    await page.reload();
    await expect(page.getByText(/^Найдено: \d+$/)).toBeVisible();
  });

  test('OFF-01 загруженный экран остаётся читаемым, онлайн-действие выключено @smoke', async ({
    context,
    freshClient,
    freshTrainer,
  }) => {
    const page = await seedSession(context, freshClient);
    await page.goto(paths.connections);
    await expect(page.getByRole('heading', { name: 'Мой тренер' })).toBeVisible();
    await offline(context, page);
    await page.getByRole('button', { name: 'Офлайн-режим' }).click();
    await expect(page.getByRole('dialog', { name: 'Офлайн-режим' })).toContainText(
      'синхронизируются автоматически',
    );
    await expect(page.getByRole('heading', { name: 'Мой тренер' })).toBeVisible();
    await page.getByRole('textbox', { name: 'Телефон или email' }).fill(freshTrainer.user.email!);
    await expect(page.getByRole('button', { name: 'Недоступно офлайн' })).toBeDisabled();
  });

  test('OFF-02 создание и правка замера офлайн синхронизируются по одному разу @core', async ({
    context,
    freshClient,
    api,
  }) => {
    const date = day(-4);
    const page = await seedSession(context, freshClient);
    await page.goto(paths.measurements);
    await offline(context, page);
    await page.getByLabel('Дата').fill(date);
    await page.getByLabel('Вес').fill('73.5');
    await page.getByLabel('Талия').fill('78');
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(page.getByText('Ожидает синхронизации')).toBeVisible();
    expect(
      (await measurements(api, freshClient)).items.filter((item) => item.date === date),
    ).toHaveLength(0);
    await online(context, page);
    await expect
      .poll(async () =>
        (await measurements(api, freshClient)).items.filter((item) => item.date === date),
      )
      .toEqual([expect.objectContaining({ weight: 73.5, waist: 78 })]);
    await page.reload();
    await page.getByLabel('Дата').fill(date);
    await expect(page.getByLabel('Вес')).toHaveValue('73.5');
    await offline(context, page);
    await page.getByLabel('Вес').fill('74.2');
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Подтвердить' }).click();
    await online(context, page);
    await expect
      .poll(async () =>
        (await measurements(api, freshClient)).items.filter((item) => item.date === date),
      )
      .toEqual([expect.objectContaining({ weight: 74.2, waist: 78 })]);
  });

  test('OFF-03 правка программы остаётся в очереди и приходит на сервер @core', async ({
    context,
    freshClient,
    programFixture,
    api,
    runId,
  }) => {
    const name = `Офлайн-программа ${runId}`;
    const page = await seedSession(context, freshClient);
    const editor = new ProgramEditor(page);
    await editor.openExisting(programFixture.programId);
    await offline(context, page);
    await editor.setName(name);
    await page.getByRole('button', { name: 'Сохранить программу' }).click();
    await expect(page).toHaveURL(paths.programs);
    await page.getByRole('tab', { name: 'Мои программы' }).click();
    await expect(page.getByRole('link').filter({ hasText: name })).toContainText(
      'ожидает синхронизации',
    );
    expect((await savedProgram(api, freshClient, programFixture.programId)).name).toBe(
      programFixture.name,
    );
    await online(context, page);
    await expect
      .poll(async () => (await savedProgram(api, freshClient, programFixture.programId)).name)
      .toBe(name);
    await page.reload();
    await page.getByRole('tab', { name: 'Мои программы' }).click();
    await expect(page.getByRole('link').filter({ hasText: name })).toHaveCount(1);
  });

  test('OFF-04 тренерский черновик синхронизируется без раскрытия другой роли @core', async ({
    browser,
    context,
    freshTrainer,
    freshClient,
    api,
    runId,
  }) => {
    const fixture = await createProgram(api, freshTrainer, runId);
    const name = `Черновик тренера ${runId}`;
    const page = await seedSession(context, freshTrainer);
    const editor = new ProgramEditor(page);
    await editor.openExisting(fixture.programId);
    await offline(context, page);
    await editor.setName(name);
    await page.getByRole('button', { name: 'Сохранить программу' }).click();
    await expect(page).toHaveURL(paths.programs);
    await page.getByRole('tab', { name: 'Мои программы' }).click();
    await expect(page.getByRole('link').filter({ hasText: name })).toContainText(
      'ожидает синхронизации',
    );
    const otherContext = await extraContext(browser);
    try {
      const other = await seedSession(otherContext, freshClient);
      await other.goto(paths.programs);
      await other.getByRole('tab', { name: 'Мои программы' }).click();
      await expect(other.getByRole('link').filter({ hasText: name })).toHaveCount(0);
      await online(context, page);
      await expect
        .poll(async () => (await savedProgram(api, freshTrainer, fixture.programId)).name)
        .toBe(name);
      await other.reload();
      await other.getByRole('tab', { name: 'Мои программы' }).click();
      await expect(other.getByRole('link').filter({ hasText: name })).toHaveCount(0);
    } finally {
      await otherContext.close();
    }
  });

  test('OFF-05 черновик и завершение офлайн переживают переход и синхронизируются один раз @smoke', async ({
    context,
    freshClient,
    programFixture,
    api,
  }) => {
    const page = await seedSession(context, freshClient);
    await page.goto(paths.programs);
    await page.getByRole('tab', { name: 'Мои программы' }).click();
    await expect(page.getByRole('link').filter({ hasText: programFixture.name })).toBeVisible();
    await startWorkout(page, programFixture);
    await offline(context, page);
    await addSet(page, 46, 8);
    await page.getByRole('link', { name: 'Настройки' }).click();
    await expect(page).toHaveURL(paths.settings);
    // В dev service worker отключён: hard reload офлайн проверяет отдельный PWA-этап.
    // Здесь проверяем браузерный черновик после SPA-перехода и reload после возврата сети.
    await page.getByRole('link', { name: 'Тренировка' }).click();
    await expect(page).toHaveURL(programSession(programFixture.programId));
    await expect(page.getByRole('button', { name: '46 кг × 8' })).toBeVisible();
    await finishWorkout(page);
    expect(await workoutCount(api, freshClient, programFixture.variantId)).toBe(0);
    await online(context, page);
    await expect.poll(() => workoutCount(api, freshClient, programFixture.variantId)).toBe(1);
    await page.reload();
    expect(await workoutCount(api, freshClient, programFixture.variantId)).toBe(1);
  });

  test('OFF-06 два действия очереди сохраняются в порядке без потерь @core', async ({
    context,
    freshClient,
    programFixture,
    api,
    runId,
  }) => {
    const date = day(-5);
    const name = `Очередь ${runId}`;
    const page = await seedSession(context, freshClient);
    await page.goto(programEdit(programFixture.programId));
    await expect(page.getByPlaceholder('Название программы')).toHaveValue(programFixture.name);
    await page.goto(program(programFixture.programId));
    await expect(page.getByRole('button', { name: 'Изменить тренировку' })).toBeVisible();
    await page.goto(paths.programs);
    await page.getByRole('tab', { name: 'Мои программы' }).click();
    await expect(page.getByRole('link').filter({ hasText: programFixture.name })).toBeVisible();
    await page.goto(paths.measurements);
    await offline(context, page);
    await page.getByLabel('Дата').fill(date);
    await page.getByLabel('Вес').fill('71');
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(page.getByText('Ожидает синхронизации')).toBeVisible();
    await page.getByRole('link', { name: 'Тренировка' }).click();
    await page.getByRole('tab', { name: 'Мои программы' }).click();
    await page.getByRole('link').filter({ hasText: programFixture.name }).click();
    await page.getByRole('button', { name: 'Изменить тренировку' }).click();
    await page.getByPlaceholder('Название программы').fill(name);
    await page.getByRole('button', { name: 'Сохранить программу' }).click();
    await page.getByRole('tab', { name: 'Мои программы' }).click();
    await expect(page.getByRole('link').filter({ hasText: name })).toContainText(
      'ожидает синхронизации',
    );
    const replay: string[] = [];
    page.on('response', (response) => {
      if (response.request().method() === 'POST' && response.url().endsWith('/api/v1/measurements'))
        replay.push('measurement');
      if (
        response.request().method() === 'PUT' &&
        response.url().endsWith(`/api/v1/programs/${programFixture.programId}`)
      )
        replay.push('program');
    });
    await online(context, page);
    await expect.poll(() => replay).toEqual(['measurement', 'program']);
    await expect
      .poll(
        async () =>
          (await measurements(api, freshClient)).items.find((item) => item.date === date)?.weight,
      )
      .toBe(71);
    await expect
      .poll(async () => (await savedProgram(api, freshClient, programFixture.programId)).name)
      .toBe(name);
  });

  test('OFF-07 временный 503 повторяет отложенный замер без дубля @core', async ({
    context,
    freshClient,
    api,
  }) => {
    const date = day(-6);
    const page = await seedSession(context, freshClient);
    await page.goto(paths.measurements);
    await offline(context, page);
    await page.getByLabel('Дата').fill(date);
    await page.getByLabel('Вес').fill('72');
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(page.getByText('Ожидает синхронизации')).toBeVisible();
    let attempts = 0;
    await page.route('**/api/v1/measurements', async (route) => {
      if (route.request().method() === 'POST') {
        attempts += 1;
        if (attempts === 1) {
          await route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: '{"code":"unavailable","message":"Temporary outage"}',
          });
          return;
        }
      }
      await route.continue();
    });
    await online(context, page);
    await expect.poll(() => attempts).toBeGreaterThanOrEqual(2);
    await expect
      .poll(async () =>
        (await measurements(api, freshClient)).items.filter((item) => item.date === date),
      )
      .toEqual([expect.objectContaining({ weight: 72 })]);
    await page.reload();
    expect(
      (await measurements(api, freshClient)).items.filter((item) => item.date === date),
    ).toHaveLength(1);
  });

  test('OFF-08 второй онлайн-редактор не перезаписывает свежую правку молча @core', async ({
    browser,
    freshClient,
    programFixture,
    api,
    runId,
  }) => {
    const firstContext = await extraContext(browser);
    const secondContext = await extraContext(browser);
    try {
      const first = new ProgramEditor(await seedSession(firstContext, freshClient));
      const second = new ProgramEditor(await seedSession(secondContext, freshClient));
      await first.openExisting(programFixture.programId);
      await second.openExisting(programFixture.programId);
      const newer = `Первая правка ${runId}`;
      await first.setName(newer);
      expect(await first.save('PUT', programFixture.programId)).toBe(200);
      await second.setName(`Устаревшая правка ${runId}`);
      const [response] = await Promise.all([
        second.page.waitForResponse(
          (r) =>
            r.request().method() === 'PUT' &&
            r.url().endsWith(`/api/v1/programs/${programFixture.programId}`),
        ),
        second.page.getByRole('button', { name: 'Сохранить программу' }).click(),
      ]);
      expect(response.status()).toBe(409);
      await expect(second.page.getByRole('alert')).toHaveText(
        'Данные изменены в другом окне. Откройте актуальную версию перед сохранением.',
      );
      await expect(second.page).toHaveURL(programEdit(programFixture.programId));
      await expect(second.page.getByPlaceholder('Название программы')).toHaveValue(
        `Устаревшая правка ${runId}`,
      );
      expect((await savedProgram(api, freshClient, programFixture.programId)).name).toBe(newer);
      await second.page.reload();
      await expect(second.page.getByPlaceholder('Название программы')).toHaveValue(newer);
    } finally {
      await firstContext.close();
      await secondContext.close();
    }
  });

  test('OFF-08 офлайн-очередь не перезаписывает более новую серверную программу @core', async ({
    browser,
    context,
    freshClient,
    programFixture,
    api,
    runId,
  }) => {
    const queued = `Офлайн ${runId}`;
    const newer = `Новая серверная ${runId}`;
    const page = await seedSession(context, freshClient);
    const editor = new ProgramEditor(page);
    await editor.openExisting(programFixture.programId);
    await offline(context, page);
    await editor.setName(queued);
    await page.getByRole('button', { name: 'Сохранить программу' }).click();
    await expect(page).toHaveURL(paths.programs);
    const secondContext = await extraContext(browser);
    try {
      const second = new ProgramEditor(await seedSession(secondContext, freshClient));
      await second.openExisting(programFixture.programId);
      await second.setName(newer);
      expect(await second.save('PUT', programFixture.programId)).toBe(200);
      expect((await savedProgram(api, freshClient, programFixture.programId)).name).toBe(newer);
      const [replayed] = await Promise.all([
        page.waitForResponse(
          (r) =>
            r.request().method() === 'PUT' &&
            r.url().endsWith(`/api/v1/programs/${programFixture.programId}`),
        ),
        online(context, page),
      ]);
      expect(replayed.status()).toBe(409);
      expect((await savedProgram(api, freshClient, programFixture.programId)).name).toBe(newer);
    } finally {
      await secondContext.close();
    }
  });

  test('OFF-09 после синхронизации итоги получают серверный номер @core', async ({
    context,
    freshClient,
    programFixture,
  }) => {
    const page = await seedSession(context, freshClient);
    await startWorkout(page, programFixture);
    await offline(context, page);
    await addSet(page, 49, 10);
    await finishWorkout(page);
    const [synced] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' && r.url().endsWith('/api/v1/workouts/sessions/sync'),
      ),
      online(context, page),
    ]);
    expect(synced.status()).toBe(201);
    const result = (await synced.json()) as { seq_number: number };
    expect(result.seq_number).toBeGreaterThan(0);
    await expect(
      page.getByRole('heading', { name: `Итоги тренировки #${result.seq_number}` }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Итоги тренировки #0' })).toHaveCount(0);
  });

  test('OFF-10 очередь не переходит другому аккаунту, владелец восстанавливает её @core @security', async ({
    context,
    freshClient,
    api,
    runId,
  }) => {
    const date = day(-7);
    const other = await registerClient(runId);
    const page = await seedSession(context, freshClient);
    await page.goto(paths.measurements);
    await offline(context, page);
    await page.getByLabel('Дата').fill(date);
    await page.getByLabel('Вес').fill('68');
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(page.getByText('Ожидает синхронизации')).toBeVisible();
    await page.getByRole('link', { name: 'Настройки' }).click();
    await page.getByRole('button', { name: 'Выйти', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Выйти', exact: true }).click();
    await expect(page).toHaveURL(paths.welcome);
    await online(context, page);
    const otherPage = await seedSession(context, other);
    await otherPage.goto(paths.measurements);
    await expect(otherPage.getByText('68 кг')).toHaveCount(0);
    expect((await measurements(api, other)).items.some((item) => item.date === date)).toBe(false);
    const ownerPage = await seedSession(context, freshClient);
    await ownerPage.goto(paths.measurements);
    await expect
      .poll(async () =>
        (await measurements(api, freshClient)).items.filter((item) => item.date === date),
      )
      .toEqual([expect.objectContaining({ weight: 68 })]);
  });
});
