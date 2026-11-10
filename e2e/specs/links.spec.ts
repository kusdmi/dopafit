import type { Browser } from '@playwright/test';

import { test, expect } from '../fixtures/test.ts';
import { seedSession } from '../fixtures/accounts.ts';
import { registerClient, registerTrainer } from '../fixtures/accounts.ts';
import { createMeasurement, createProgram, finishWorkout, linkClient } from '../fixtures/data.ts';
import {
  connectionEdit,
  connectionMeasurements,
  paths,
  program,
  programStart,
} from '../support/paths.ts';

const measurements = (cardId: string) =>
  `/api/v1/measurements?client_id=${encodeURIComponent(cardId)}`;

function tomorrow(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function newContext(browser: Browser) {
  return browser.newContext({
    baseURL: process.env.E2E_BASE_URL ?? 'http://frontend-e2e:5173',
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
  });
}

async function unlinkClient(
  api: import('../fixtures/api.ts').Api,
  client: import('../fixtures/accounts.ts').Session,
  cardId: string,
): Promise<void> {
  await api.expectOk(
    'unlink client',
    api.post(`/api/v1/clients/${cardId}/unlink`, client.tokens),
    200,
  );
}

test.describe('Связь клиента и тренера', () => {
  test('LINK-01 запрос клиента появляется у тренера @smoke', async ({
    browser,
    freshClient,
    freshTrainer,
    api,
  }) => {
    const clientContext = await newContext(browser);
    const trainerContext = await newContext(browser);
    try {
      const clientPage = await seedSession(clientContext, freshClient);
      await clientPage.goto(paths.connections);
      await clientPage
        .getByRole('textbox', { name: 'Телефон или email' })
        .fill(freshTrainer.user.email!);
      const [created] = await Promise.all([
        clientPage.waitForResponse(
          (r) => r.request().method() === 'POST' && r.url().endsWith('/api/v1/link-requests'),
        ),
        clientPage.getByRole('button', { name: 'Отправить запрос' }).click(),
      ]);
      expect(created.status()).toBe(201);
      const outgoing = await api.expectOk<{ id: string; status: string }[]>(
        'outgoing requests',
        api.get('/api/v1/link-requests?direction=outgoing', freshClient.tokens),
        200,
      );
      expect(outgoing.filter((r) => r.status === 'pending')).toHaveLength(1);

      const trainerPage = await seedSession(trainerContext, freshTrainer);
      await trainerPage.goto(paths.connections);
      await trainerPage.getByRole('tab', { name: 'Запросы' }).click();
      // В карточке заявки публичное имя, не контакт. Наличие входящей заявки
      // после нового входа доказывает синхронизацию через сервер.
      await expect(trainerPage.getByRole('button', { name: 'Принять' })).toHaveCount(1);
    } finally {
      await clientContext.close();
      await trainerContext.close();
    }
  });

  test('LINK-02 принятие заявки видно обеим сторонам после reload @smoke', async ({
    browser,
    freshClient,
    freshTrainer,
    api,
    runId,
  }) => {
    await api.expectOk(
      'prepare request',
      api.post('/api/v1/link-requests', freshClient.tokens, { query: freshTrainer.user.email }),
      201,
    );
    const trainerContext = await newContext(browser);
    const clientContext = await newContext(browser);
    try {
      const trainerPage = await seedSession(trainerContext, freshTrainer);
      await trainerPage.goto(paths.connections);
      await trainerPage.getByRole('tab', { name: 'Запросы' }).click();
      const [accepted] = await Promise.all([
        trainerPage.waitForResponse(
          (r) => r.request().method() === 'POST' && r.url().endsWith('/accept'),
        ),
        trainerPage.getByRole('button', { name: 'Принять' }).click(),
      ]);
      expect(accepted.status()).toBe(200);
      await trainerPage.reload();
      await trainerPage.getByRole('tab', { name: 'Мои клиенты' }).click();
      await expect(
        trainerPage.getByRole('listitem').filter({ hasText: `Клиент ${runId}` }),
      ).toHaveCount(1);
      const clientPage = await seedSession(clientContext, freshClient);
      await clientPage.goto(paths.connections);
      await clientPage.reload();
      await expect(clientPage.getByRole('heading', { name: 'Ваш тренер' })).toBeVisible();
      await expect(clientPage.getByText(`Тренер ${runId}`, { exact: true })).toBeVisible();
    } finally {
      await trainerContext.close();
      await clientContext.close();
    }
  });

  test('LINK-03 отказ заявки виден клиенту и допускает повтор @core', async ({
    browser,
    freshClient,
    freshTrainer,
    api,
  }) => {
    const request = await api.expectOk<{ id: string }>(
      'prepare request',
      api.post('/api/v1/link-requests', freshClient.tokens, { query: freshTrainer.user.email }),
      201,
    );
    const trainerContext = await newContext(browser);
    const clientContext = await newContext(browser);
    try {
      const trainerPage = await seedSession(trainerContext, freshTrainer);
      await trainerPage.goto(paths.connections);
      await trainerPage.getByRole('tab', { name: 'Запросы' }).click();
      const [declined] = await Promise.all([
        trainerPage.waitForResponse(
          (r) =>
            r.request().method() === 'POST' &&
            r.url().endsWith(`/api/v1/link-requests/${request.id}/decline`),
        ),
        trainerPage.getByRole('button', { name: 'Отклонить' }).click(),
      ]);
      expect(declined.status()).toBe(200);
      const clientPage = await seedSession(clientContext, freshClient);
      await clientPage.goto(paths.connections);
      await clientPage.getByRole('tab', { name: 'Мои запросы' }).click();
      await expect.soft(clientPage.getByText('Отклонён')).toBeVisible();
      const ownTrainer = await api.expectOk<{ trainer: unknown }>(
        'no link after decline',
        api.get('/api/v1/clients/my-trainer', freshClient.tokens),
        200,
      );
      expect(ownTrainer.trainer).toBeNull();
      const repeated = await api.post('/api/v1/link-requests', freshClient.tokens, {
        query: freshTrainer.user.email,
      });
      expect(repeated.status()).toBe(201);
    } finally {
      await trainerContext.close();
      await clientContext.close();
    }
  });

  test('LINK-04 быстрое повторение не создаёт дубликаты заявок @core', async ({
    context,
    freshClient,
    freshTrainer,
    api,
  }) => {
    const page = await seedSession(context, freshClient);
    await page.goto(paths.connections);
    await page.getByRole('textbox', { name: 'Телефон или email' }).fill(freshTrainer.user.email!);
    // Два клика могут дать 201 и 409 в любом порядке; итоговое число заявок
    // важнее порядка сетевых ответов.
    await page.getByRole('button', { name: 'Отправить запрос' }).dblclick();
    await page.getByRole('tab', { name: 'Мои запросы' }).click();
    await expect(page.getByRole('button', { name: 'Отменить запрос' })).toHaveCount(1);
    const outgoing = await api.expectOk<{ status: string }[]>(
      'outgoing requests',
      api.get('/api/v1/link-requests?direction=outgoing', freshClient.tokens),
      200,
    );
    expect(outgoing.filter((r) => r.status === 'pending')).toHaveLength(1);
  });

  test('LINK-05 неизвестный контакт сообщает понятный результат @core', async ({
    context,
    freshClient,
    runId,
    api,
  }) => {
    const page = await seedSession(context, freshClient);
    await page.goto(paths.connections);
    await page
      .getByRole('textbox', { name: 'Телефон или email' })
      .fill(`nobody-${runId}@e2e.dopafit.test`);
    const [response] = await Promise.all([
      page.waitForResponse(
        (r) => r.request().method() === 'POST' && r.url().endsWith('/api/v1/link-requests'),
      ),
      page.getByRole('button', { name: 'Отправить запрос' }).click(),
    ]);
    expect(response.status()).toBe(404);
    await expect(page.getByText('Аккаунт с такими данными не найден')).toBeVisible();
    const outgoing = await api.expectOk<{ status: string }[]>(
      'outgoing requests',
      api.get('/api/v1/link-requests?direction=outgoing', freshClient.tokens),
      200,
    );
    expect(outgoing).toHaveLength(0);
  });

  test('LINK-06 тренер видит самостоятельные подходы по переданной программе @smoke', async ({
    context,
    linkedPair,
    api,
    runId,
  }) => {
    const { client, trainer, link } = linkedPair;
    const source = await createProgram(api, trainer, runId);
    const copy = await api.expectOk<{ id: string }>(
      'share program',
      api.post(`/api/v1/programs/${source.programId}/share`, trainer.tokens, {
        client_id: link.cardId,
      }),
      200,
    );
    const page = await seedSession(context, client);
    await page.goto(program(copy.id));
    await expect(page.getByRole('heading', { name: source.name })).toBeVisible();
    await page.getByRole('button', { name: 'Начать тренировку' }).click();
    await expect(page).toHaveURL(programStart(copy.id));
    await expect(page.getByRole('heading', { name: 'Выбор дня' })).toBeVisible();
    await page.getByRole('button', { name: 'День 1' }).click();
    await page.getByRole('button', { name: 'Старт', exact: true }).click();
    await page.getByLabel('КГ', { exact: true }).fill('57');
    await page.getByRole('spinbutton', { name: 'Повторы' }).fill('9');
    await page.getByRole('button', { name: 'Добавить', exact: true }).click();
    await page.getByRole('button', { name: 'Завершить тренировку' }).click();
    const [synced] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' && r.url().endsWith('/api/v1/workouts/sessions/sync'),
      ),
      page.getByRole('button', { name: 'Завершить', exact: true }).click(),
    ]);
    expect(synced.status()).toBe(201);
    const own = await api.expectOk<{
      stats: { total_workouts: number };
      points: { weight: number; reps: number }[];
    }>(
      'client workout',
      api.get(
        `/api/v1/analytics/workouts/series?date_from=2020-01-01&date_to=2030-12-31`,
        client.tokens,
      ),
      200,
    );
    expect(own.stats.total_workouts).toBe(1);
    expect(own.points[0]).toMatchObject({ weight: 57, reps: 9 });
    const trainerView = await api.expectOk<typeof own>(
      'trainer workout',
      api.get(
        `/api/v1/analytics/workouts/series?client_id=${link.cardId}&date_from=2020-01-01&date_to=2030-12-31`,
        trainer.tokens,
      ),
      200,
    );
    expect(trainerView.stats.total_workouts).toBe(1);
    expect(trainerView.points[0]).toMatchObject({ weight: 57, reps: 9 });
  });

  test('LINK-07 тренер видит разрешённые замеры только связанного клиента @core @security', async ({
    browser,
    linkedPair,
    api,
  }) => {
    const { client, trainer, link } = linkedPair;
    const measurement = await createMeasurement(api, client, { date: tomorrow() });
    const allowed = await api.expectOk<{
      items: { id: string; weight: number; photos: unknown[] }[];
    }>('linked measurements', api.get(measurements(link.cardId), trainer.tokens), 200);
    expect(allowed.items).toContainEqual(
      expect.objectContaining({ id: measurement.measurementId, weight: 78.5, photos: [] }),
    );
    expect(
      (await api.get(`/api/v1/measurements/${measurement.measurementId}`, trainer.tokens)).status(),
    ).toBe(404);
    const trainerContext = await newContext(browser);
    try {
      const page = await seedSession(trainerContext, trainer);
      await page.goto(connectionMeasurements(link.cardId));
      await expect(page.getByText('78.5 кг')).toBeVisible();
      await expect(page.getByRole('img', { name: /фото/i })).toHaveCount(0);
    } finally {
      await trainerContext.close();
    }
  });
  test('LINK-08 после отзыва связи замеры и фото недоступны тренеру @core @security', async ({
    browser,
    linkedPair,
    api,
  }) => {
    const { client, trainer, link } = linkedPair;
    const measurement = await createMeasurement(api, client, { date: tomorrow() });
    const trainerContext = await newContext(browser);
    const clientContext = await newContext(browser);
    try {
      const trainerPage = await seedSession(trainerContext, trainer);
      await trainerPage.goto(connectionMeasurements(link.cardId));
      await expect(trainerPage.getByText(`${measurement.weight} кг`)).toBeVisible();

      const clientPage = await seedSession(clientContext, client);
      await clientPage.goto(paths.connections);
      await expect(clientPage.getByRole('heading', { name: 'Ваш тренер' })).toBeVisible();
      // Разрываем через клиентский экран: важно проверить, что и клиентская
      // карточка, и уже открытый тренерский экран реагируют на тот же отзыв.
      await clientPage.getByRole('button', { name: 'Отвязаться от тренера' }).click();
      const [unlinked] = await Promise.all([
        clientPage.waitForResponse(
          (r) =>
            r.request().method() === 'POST' &&
            r.url().endsWith(`/api/v1/clients/${link.cardId}/unlink`),
        ),
        clientPage.getByRole('button', { name: 'Отвязаться', exact: true }).click(),
      ]);
      expect(unlinked.status()).toBe(200);
      await clientPage.reload();
      await expect(clientPage.getByText('У вас пока нет тренера')).toBeVisible();

      await trainerPage.reload();
      await expect.soft(trainerPage.getByText(`${measurement.weight} кг`)).toHaveCount(0);
      const list = await api.get(measurements(link.cardId), trainer.tokens);
      expect.soft(list.status()).toBe(404);
      // Отдельный замер и его фотографии не должны раскрываться по известному ID.
      const detail = await api.get(
        `/api/v1/measurements/${measurement.measurementId}`,
        trainer.tokens,
      );
      expect(detail.status()).toBe(404);
      const photoDates = await api.get(
        `/api/v1/analytics/photos/dates?client_id=${link.cardId}&kind=front`,
        trainer.tokens,
      );
      expect(photoDates.status()).toBe(403);
    } finally {
      await trainerContext.close();
      await clientContext.close();
    }
  });

  test('LINK-09 после отзыва связи недоступны график и тренировочная аналитика @core @security', async ({
    linkedPair,
    api,
    runId,
  }) => {
    const { client, trainer, link } = linkedPair;
    const measurement = await createMeasurement(api, client, { date: tomorrow() });
    const program = await createProgram(api, client, runId);
    await finishWorkout(api, client, program);
    const dateFrom = '2020-01-01';
    const dateTo = '2030-12-31';
    const chart = `/api/v1/analytics/anthropometry/series?client_id=${link.cardId}&date_from=${dateFrom}&date_to=${dateTo}&parameters=weight`;
    const workouts = `/api/v1/analytics/workouts/series?client_id=${link.cardId}&date_from=${dateFrom}&date_to=${dateTo}`;
    const history = `/api/v1/workouts/history/by-variant/${program.variantId}?client_id=${link.cardId}`;
    // До отзыва связь даёт доступ к разрешённым числам, иначе отрицательная
    // проверка могла бы пройти просто из-за неверного ID карточки.
    const before = await api.expectOk<{ parameters: { points: { value: number }[] }[] }>(
      'linked weight chart',
      api.get(chart, trainer.tokens),
      200,
    );
    expect(before.parameters[0]?.points).toContainEqual(
      expect.objectContaining({ value: measurement.weight }),
    );
    expect((await api.get(measurements(link.cardId), trainer.tokens)).status()).toBe(200);
    // Dashboard тренера относится только к его собственным данным. Фиксируем
    // этот ответ до отзыва, чтобы проверить, что чужие числа не попали туда.
    const dashboardBefore = await api.expectOk<{
      measurement_chart: unknown;
      month_workout_count: number;
    }>('trainer dashboard before', api.get('/api/v1/analytics/dashboard', trainer.tokens), 200);
    await unlinkClient(api, client, link.cardId);
    expect.soft((await api.get(chart, trainer.tokens)).status()).toBe(404);
    expect.soft((await api.get(workouts, trainer.tokens)).status()).toBe(404);
    expect.soft((await api.get(history, trainer.tokens)).status()).toBe(404);
    const dashboardAfter = await api.expectOk<typeof dashboardBefore>(
      'trainer dashboard after',
      api.get('/api/v1/analytics/dashboard', trainer.tokens),
      200,
    );
    expect(dashboardAfter.measurement_chart).toEqual(dashboardBefore.measurement_chart);
    expect(dashboardAfter.month_workout_count).toBe(dashboardBefore.month_workout_count);
  });

  test('SEC-05 уже открытая вкладка теряет замеры при следующем действии @core @security', async ({
    browser,
    linkedPair,
    api,
  }) => {
    const { client, trainer, link } = linkedPair;
    const measurement = await createMeasurement(api, client, { date: tomorrow() });
    const trainerContext = await newContext(browser);
    try {
      const page = await seedSession(trainerContext, trainer);
      await page.goto(connectionMeasurements(link.cardId));
      await expect(page.getByText(`${measurement.weight} кг`)).toBeVisible();
      await unlinkClient(api, client, link.cardId);
      // Уже открытый экран не должен продолжать отдавать приватные данные,
      // когда тренер обновляет его после отзыва связи.
      await page.reload();
      await expect(page.getByText(`${measurement.weight} кг`)).toHaveCount(0);
      expect((await api.get(measurements(link.cardId), trainer.tokens)).status()).toBe(404);
    } finally {
      await trainerContext.close();
    }
  });

  test('LINK-10 после разрыва нельзя передать программу и назначить тренировку @core @security', async ({
    browser,
    linkedPair,
    api,
    runId,
  }) => {
    const { client, trainer, link } = linkedPair;
    const source = await createProgram(api, trainer, runId);
    await unlinkClient(api, client, link.cardId);
    const measurement = await createMeasurement(api, client, { date: tomorrow() });
    expect.soft((await api.get(measurements(link.cardId), trainer.tokens)).status()).toBe(404);
    const share = await api.post(`/api/v1/programs/${source.programId}/share`, trainer.tokens, {
      client_id: link.cardId,
    });
    expect(share.status()).toBe(404);
    const today = new Date().toISOString().slice(0, 10);
    const calendar = await api.post('/api/v1/calendar/events', trainer.tokens, {
      date: today,
      time: '12:00',
      client_ids: [link.cardId],
    });
    expect(calendar.status()).toBe(404);
    const trainerContext = await newContext(browser);
    try {
      const page = await seedSession(trainerContext, trainer);
      await page.goto(connectionMeasurements(link.cardId));
      await expect(page.getByText(`${measurement.weight} кг`)).toHaveCount(0);
    } finally {
      await trainerContext.close();
    }
  });

  test('LINK-11 повторная связь открывает всю числовую историю @core @security', async ({
    api,
    runId,
  }) => {
    const trainer = await registerTrainer(runId);
    const client = await registerClient(runId);
    // Числовой замер до связи доступен при новом активном согласии.
    const old = await createMeasurement(api, client);
    const link = await linkClient(api, trainer, client);
    await unlinkClient(api, client, link.cardId);
    const request = await api.expectOk<{ id: string }>(
      'relink request',
      api.post('/api/v1/link-requests', client.tokens, { query: trainer.user.email }),
      201,
    );
    expect(
      (await api.post(`/api/v1/link-requests/${request.id}/accept`, trainer.tokens)).status(),
    ).toBe(200);
    const list = await api.expectOk<{ items: { id: string; date: string }[] }>(
      'measurements after relink',
      api.get(measurements(link.cardId), trainer.tokens),
      200,
    );
    expect(list.items.some((item) => item.id === old.measurementId)).toBe(true);
    // Доступна и сегодняшняя запись онбординга.
    expect(list.items.some((item) => item.date === new Date().toISOString().slice(0, 10))).toBe(
      true,
    );
  });

  test('LINK-12 чужой тренер и клиентский deep link не открывают карточку @core @security', async ({
    browser,
    linkedPair,
    api,
    runId,
  }) => {
    const otherTrainer = await registerTrainer(runId);
    const { client, link } = linkedPair;
    const measurement = await createMeasurement(api, client, { date: tomorrow() });
    expect((await api.get(`/api/v1/clients/${link.cardId}`, otherTrainer.tokens)).status()).toBe(
      404,
    );
    expect((await api.get(measurements(link.cardId), otherTrainer.tokens)).status()).toBe(404);
    expect(
      (
        await api.get(`/api/v1/measurements/${measurement.measurementId}`, otherTrainer.tokens)
      ).status(),
    ).toBe(404);
    const otherContext = await newContext(browser);
    const clientContext = await newContext(browser);
    try {
      const otherPage = await seedSession(otherContext, otherTrainer);
      await otherPage.goto(connectionMeasurements(link.cardId));
      await expect(otherPage.getByText(`${measurement.weight} кг`)).toHaveCount(0);
      const clientPage = await seedSession(clientContext, client);
      await clientPage.goto(connectionEdit(link.cardId));
      await expect(clientPage).toHaveURL(paths.connections);
      await expect(clientPage.getByRole('heading', { name: 'Мой тренер' })).toBeVisible();
    } finally {
      await otherContext.close();
      await clientContext.close();
    }
  });
});
