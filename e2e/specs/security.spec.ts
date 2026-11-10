import { randomUUID } from 'node:crypto';
import type { Browser, Page } from '@playwright/test';

import { registerClient, registerTrainer, seedSession } from '../fixtures/accounts.ts';
import { createMeasurement, createProgram } from '../fixtures/data.ts';
import { uploadPhoto } from '../fixtures/photos.ts';
import { expect, test } from '../fixtures/test.ts';
import {
  connectionEdit,
  connectionMeasurements,
  exercise,
  paths,
  program,
  programEdit,
  programSession,
  programStart,
} from '../support/paths.ts';

function browserContext(browser: Browser) {
  return browser.newContext({
    baseURL: process.env.E2E_BASE_URL ?? 'http://frontend-e2e:5173',
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
  });
}

async function signOut(page: Page): Promise<void> {
  await page.goto(paths.settings);
  await page.getByRole('button', { name: 'Выйти' }).click();
  const documentOrigin = await page.evaluate(() => performance.timeOrigin);
  const exitDocument = page.waitForResponse(
    (response) =>
      response.request().isNavigationRequest() &&
      new URL(response.url()).pathname === paths.welcome,
  );
  await page.getByRole('dialog').getByRole('button', { name: 'Выйти' }).click();
  await exitDocument;
  await page.waitForFunction((origin) => performance.timeOrigin !== origin, documentOrigin);
  await expect(page).toHaveURL(new RegExp(`${paths.welcome}$`));
  await expect(page.getByRole('button', { name: 'Войти', exact: true })).toBeVisible();
}

function tomorrow(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

test.describe('M. Права доступа и изоляция данных', () => {
  test('SEC-01 клиентский аккаунт не открывает тренерские маршруты и чужой конструктор @smoke @security', async ({
    context,
    api,
    linkedPair,
    runId,
  }) => {
    const { client, trainer, link } = linkedPair;
    const trainerProgram = await createProgram(api, trainer, runId);
    const page = await seedSession(context, client);
    await page.goto(connectionEdit(link.cardId));
    await expect(page).toHaveURL(new RegExp(`${paths.connections}$`));
    await expect(page.getByRole('heading', { name: 'Мой тренер' })).toBeVisible();
    await page.goto(programEdit(trainerProgram.programId));
    await expect(page.getByText('Не удалось загрузить программу')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Название программы' })).toHaveCount(0);
    await page.goto(paths.analytics);
    await expect(page.getByRole('tab', { name: 'Клиенты' })).toHaveCount(0);
    expect(
      (await api.get(`/api/v1/programs/${trainerProgram.programId}`, client.tokens)).status(),
    ).toBe(404);
  });

  test('SEC-02 чужой клиент не читает программу и замер по известному ID @smoke @security', async ({
    browser,
    api,
    freshClient,
    runId,
  }) => {
    const stranger = await registerClient(`${runId}-stranger`);
    const ownerProgram = await createProgram(api, freshClient, runId);
    const ownerMeasurement = await createMeasurement(api, freshClient, { weight: 73.6 });
    const ownerContext = await browserContext(browser);
    const strangerContext = await browserContext(browser);
    try {
      const ownerPage = await seedSession(ownerContext, freshClient);
      await ownerPage.goto(program(ownerProgram.programId));
      await expect(ownerPage.getByRole('heading', { name: ownerProgram.name })).toBeVisible();
      expect(
        (
          await api.get(
            `/api/v1/measurements/${ownerMeasurement.measurementId}`,
            freshClient.tokens,
          )
        ).status(),
      ).toBe(200);

      const strangerPage = await seedSession(strangerContext, stranger);
      await strangerPage.goto(program(ownerProgram.programId));
      await expect(strangerPage.getByText('Не удалось загрузить программу')).toBeVisible();
      await expect(strangerPage.getByText(ownerProgram.name)).toHaveCount(0);
      expect(
        (await api.get(`/api/v1/programs/${ownerProgram.programId}`, stranger.tokens)).status(),
      ).toBe(404);
      expect(
        (
          await api.get(`/api/v1/measurements/${ownerMeasurement.measurementId}`, stranger.tokens)
        ).status(),
      ).toBe(404);
      await strangerPage.goto(paths.measurements);
      await expect(strangerPage.getByText('73.6 кг')).toHaveCount(0);
    } finally {
      await ownerContext.close();
      await strangerContext.close();
    }
  });

  test('SEC-03 другой тренер не читает карточку, замер, график и подходы клиента @smoke @security', async ({
    context,
    api,
    linkedPair,
    runId,
  }) => {
    const { client, trainer, link } = linkedPair;
    const stranger = await registerTrainer(`${runId}-stranger`);
    const measurement = await createMeasurement(api, client, { date: tomorrow(), weight: 71.3 });
    const programFixture = await createProgram(api, trainer, runId);
    const dateFrom = '2020-01-01';
    const dateTo = '2030-12-31';
    expect((await api.get(`/api/v1/clients/${link.cardId}`, trainer.tokens)).status()).toBe(200);
    expect((await api.get(`/api/v1/clients/${link.cardId}`, stranger.tokens)).status()).toBe(404);
    expect(
      (await api.get(`/api/v1/measurements?client_id=${link.cardId}`, stranger.tokens)).status(),
    ).toBe(404);
    expect(
      (
        await api.get(`/api/v1/measurements/${measurement.measurementId}`, stranger.tokens)
      ).status(),
    ).toBe(404);
    expect(
      (
        await api.get(
          `/api/v1/analytics/anthropometry/series?client_id=${link.cardId}&date_from=${dateFrom}&date_to=${dateTo}&parameters=weight`,
          stranger.tokens,
        )
      ).status(),
    ).toBe(404);
    expect(
      (
        await api.get(
          `/api/v1/workouts/history/by-variant/${programFixture.variantId}?client_id=${link.cardId}`,
          stranger.tokens,
        )
      ).status(),
    ).toBe(404);
    const page = await seedSession(context, stranger);
    await page.goto(connectionMeasurements(link.cardId));
    await expect(page.getByText(`${measurement.weight} кг`)).toHaveCount(0);
    await page.goto(connectionEdit(link.cardId));
    await expect(page.getByText(client.user.email!)).toHaveCount(0);
  });

  test('SEC-04 выход скрывает кэш после Back, reload и во второй вкладке @smoke @security', async ({
    context,
    freshClient,
  }) => {
    const page = await seedSession(context, freshClient);
    const second = await context.newPage();
    await second.goto(paths.settings);
    await expect(second.getByText(freshClient.user.email!)).toBeVisible();
    await signOut(page);
    await page.goBack({ waitUntil: 'commit' });
    await expect(page.getByRole('button', { name: 'Войти', exact: true })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${paths.welcome}$`));
    await expect.soft(page.getByText(freshClient.user.email!)).toHaveCount(0);
    await page.reload();
    await expect.soft(page.getByText(freshClient.user.email!)).toHaveCount(0);
    // Вторая уже открытая вкладка — отдельный источник кэша, который logout
    // обязан немедленно скрыть, даже когда в ней не было нового сетевого запроса.
    await expect.soft(second.getByText(freshClient.user.email!)).toHaveCount(0);
    await second.reload();
    await expect(second).toHaveURL(new RegExp(`${paths.welcome}$`));
    await expect(second.getByText(freshClient.user.email!)).toHaveCount(0);
  });

  test('SEC-06 ошибочный и удалённый ID программы дают безопасное пустое состояние @core @security', async ({
    context,
    api,
    freshClient,
    runId,
  }) => {
    const page = await seedSession(context, freshClient);
    await page.goto(program(randomUUID()));
    await expect(page.getByText('Не удалось загрузить программу')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Основная навигация' })).toBeVisible();
    const prepared = await createProgram(api, freshClient, runId);
    expect(
      (await api.delete(`/api/v1/programs/${prepared.programId}`, freshClient.tokens)).status(),
    ).toBe(204);
    await page.goto(program(prepared.programId));
    await expect(page.getByText('Не удалось загрузить программу')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Основная навигация' })).toBeVisible();
  });

  test('SEC-07 смена аккаунта очищает избранное, очередь, черновик и уведомления @smoke @security', async ({
    context,
    api,
    freshClient,
    freshTrainer,
    programFixture,
    runId,
  }) => {
    const other = await registerClient(`${runId}-other`);
    const date = new Date(Date.now() - 8 * 86_400_000).toISOString().slice(0, 10);
    const favorite = await api.expectOk<{ items: { id: string; name: string }[] }>(
      'catalog exercise',
      api.get('/api/v1/exercises?limit=1', freshClient.tokens),
      200,
    );
    const favoriteId = favorite.items[0].id;
    expect(
      (
        await api.put(
          `/api/v1/exercises/${favoriteId}/favorite?is_favorite=true`,
          freshClient.tokens,
          {},
        )
      ).status(),
    ).toBe(200);
    await api.expectOk(
      'prepare private notification',
      api.post('/api/v1/link-requests', freshTrainer.tokens, {
        query: freshClient.user.email,
      }),
      201,
    );
    const page = await seedSession(context, freshClient);
    await page.goto(paths.homeNotifications);
    await expect(page.getByRole('button', { name: /Тренер хочет добавить вас/ })).toBeVisible();
    await page.goto(exercise(favoriteId));
    await expect(page.getByRole('button', { name: 'Убрать из избранного' })).toBeVisible();
    await page.goto(program(programFixture.programId));
    await page.getByRole('button', { name: 'Начать тренировку' }).click();
    await expect(page).toHaveURL(programStart(programFixture.programId));
    await expect(page.getByRole('heading', { name: 'Выбор дня' })).toBeVisible();
    await page.getByRole('button', { name: 'День 1' }).click();
    await page.getByRole('button', { name: 'Старт', exact: true }).click();
    await expect(page).toHaveURL(programSession(programFixture.programId));
    await page.getByLabel('КГ', { exact: true }).fill('47.3');
    await page.getByRole('spinbutton', { name: 'Повторы' }).fill('9');
    await page.getByRole('button', { name: 'Добавить', exact: true }).click();
    await expect(page.getByRole('button', { name: '47.3 кг × 9' })).toBeVisible();
    await page.goto(paths.measurements);
    await expect(page.getByText('Активная тренировка')).toBeVisible();
    await context.setOffline(true);
    await expect(page.getByRole('button', { name: 'Офлайн-режим' })).toBeVisible();
    await page.getByLabel('Дата').fill(date);
    await page.getByLabel('Вес').fill('68.3');
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(page.getByText('Ожидает синхронизации')).toBeVisible();
    // Возвращаем сеть с контролируемым 503, чтобы очередь осталась на устройстве
    // вплоть до выхода и не успела синхронизироваться под старым аккаунтом.
    await page.route('**/api/v1/measurements', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{"code":"unavailable","message":"Temporary outage"}',
        });
      } else {
        await route.continue();
      }
    });
    await context.setOffline(false);
    await page.getByRole('link', { name: 'Настройки' }).click();
    await signOut(page);
    await page.unroute('**/api/v1/measurements');
    const switched = await seedSession(context, other);
    await switched.goto(exercise(favoriteId));
    await expect(switched.getByRole('button', { name: 'В избранное' })).toBeVisible();
    await switched.goto(paths.home);
    await expect(switched.getByText('Активная тренировка')).toHaveCount(0);
    await switched.goto(paths.measurements);
    await expect(switched.getByText('68.3 кг')).toHaveCount(0);
    await switched.goto(paths.homeNotifications);
    await expect(switched.getByRole('button', { name: /Тренер хочет добавить вас/ })).toHaveCount(
      0,
    );
    const otherMeasurements = await api.expectOk<{ items: { date: string }[] }>(
      'other account measurements',
      api.get('/api/v1/measurements', other.tokens),
      200,
    );
    expect(otherMeasurements.items.some((item) => item.date === date)).toBe(false);
    expect(
      (await api.get(`/api/v1/programs/${programFixture.programId}`, other.tokens)).status(),
    ).toBe(404);
  });

  test('SEC-08 ссылка на частное фото замера не открывается другому аккаунту @core @security', async ({
    browser,
    api,
    freshClient,
    measurementFixture,
    runId,
  }) => {
    const stranger = await registerClient(`${runId}-stranger`);
    await uploadPhoto(freshClient, measurementFixture.measurementId, 'front');
    const previous = await createMeasurement(api, freshClient, {
      date: new Date(Date.parse(measurementFixture.date) - 86_400_000).toISOString().slice(0, 10),
      weight: 79,
    });
    await uploadPhoto(freshClient, previous.measurementId, 'front');
    const ownerContext = await browserContext(browser);
    const strangerContext = await browserContext(browser);
    try {
      const ownerPage = await seedSession(ownerContext, freshClient);
      await ownerPage.goto(paths.measurements);
      await ownerPage
        .getByRole('button', { name: /Замер за/ })
        .filter({ hasText: '78.5 кг' })
        .click();
      await expect(
        ownerPage.getByRole('dialog').getByRole('img', { name: 'Спереди' }),
      ).toHaveAttribute('src', /^blob:/);
      const ownerRecord = await api.expectOk<{ photos: { kind: string; url: string }[] }>(
        'owner measurement with photo',
        api.get(`/api/v1/measurements/${measurementFixture.measurementId}`, freshClient.tokens),
      );
      const compare = await api.expectOk<{ first: { url: string }; second: { url: string } }>(
        'compare private photos',
        api.get(
          `/api/v1/analytics/photos/compare?kind=front&first_date=${previous.date}&second_date=${measurementFixture.date}`,
          freshClient.tokens,
        ),
      );
      const strangerPage = await seedSession(strangerContext, stranger);
      for (const url of [ownerRecord.photos[0].url, compare.first.url, compare.second.url]) {
        expect(url).toMatch(/^\/api\/v1\/measurements\//);
        expect(url).not.toContain('X-Amz-');
        const ownerResponse = await ownerPage.request.get(url, {
          headers: { Authorization: `Bearer ${freshClient.tokens.access_token}` },
        });
        expect(ownerResponse.status()).toBe(200);
        expect(ownerResponse.headers()['content-type']).toMatch(/^image\//);
        const leaked = await strangerPage.request.get(url, {
          headers: { Authorization: `Bearer ${stranger.tokens.access_token}` },
        });
        expect(leaked.status()).toBe(404);
        expect((await strangerPage.request.get(url)).status()).toBe(401);
      }
      expect(
        (
          await api.get(`/api/v1/measurements/${measurementFixture.measurementId}`, stranger.tokens)
        ).status(),
      ).toBe(404);
    } finally {
      await ownerContext.close();
      await strangerContext.close();
    }
  });
});
