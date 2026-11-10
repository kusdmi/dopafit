import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';

import { seedSession } from '../fixtures/accounts.ts';
import type { Session } from '../fixtures/accounts.ts';
import type { Api } from '../fixtures/api.ts';
import { createProgram } from '../fixtures/data.ts';
import type { ProgramFixture } from '../fixtures/data.ts';
import { expect, test } from '../fixtures/test.ts';
import { connectionMeasurements, paths } from '../support/paths.ts';
import type { components } from '../../frontend/src/shared/api/schema.d.ts';

/** Section G, calendar and analytics checks. Preconditions are created over API. */
type Event = components['schemas']['EventOut'];
type Month = components['schemas']['CalendarMonthOut'];

function futureDate(days = 2): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

async function showMonth(page: Page, date: string): Promise<void> {
  await page.goto(paths.homeCalendar);
  // План на несколько дней вперёд может попасть в следующий календарный месяц.
  const month = Number(date.slice(5, 7));
  const year = Number(date.slice(0, 4));
  const current = await page.evaluate(() => ({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
  }));
  if (year > current.year || (year === current.year && month > current.month)) {
    await page.getByRole('button', { name: 'Следующий месяц' }).click();
  }
}

async function openDate(page: Page, date: string): Promise<void> {
  await showMonth(page, date);
  await page.getByRole('button', { name: String(Number(date.slice(8, 10))), exact: true }).click();
}

async function createEvent(
  api: Api,
  trainer: Session,
  cardId: string,
  date: string,
): Promise<Event> {
  return api.expectOk<Event>(
    'prepare calendar event',
    api.post('/api/v1/calendar/events', trainer.tokens, {
      date,
      time: '18:00:00',
      client_ids: [cardId],
    }),
    201,
  );
}

async function month(api: Api, actor: Session, date: string): Promise<Month> {
  return api.expectOk<Month>(
    'calendar month',
    api.get(
      `/api/v1/calendar/month?year=${date.slice(0, 4)}&month=${Number(date.slice(5, 7))}`,
      actor.tokens,
    ),
    200,
  );
}

async function clientWorkout(
  api: Api,
  trainer: Session,
  cardId: string,
  program: ProgramFixture,
): Promise<void> {
  // A trainer may read only sessions inside the active link period.
  const started = Date.now();
  await api.expectOk(
    'prepare coached workout',
    api.post('/api/v1/workouts/sessions/sync', trainer.tokens, {
      id: randomUUID(),
      client_id: cardId,
      program_id: program.programId,
      day_id: program.dayId,
      started_at: new Date(started).toISOString(),
      finished_at: new Date(started + 30 * 60_000).toISOString(),
      local_date: futureDate(0),
      exercises: [
        { slot_id: program.slotId, chosen_variant_id: program.variantId, is_completed: true },
      ],
      sets: [
        {
          id: randomUUID(),
          slot_id: program.slotId,
          variant_id: program.variantId,
          weight: 50,
          reps: 10,
          performed_at: new Date(started + 5 * 60_000).toISOString(),
        },
        {
          id: randomUUID(),
          slot_id: program.slotId,
          variant_id: program.variantId,
          weight: 55,
          reps: 10,
          performed_at: new Date(started + 10 * 60_000).toISOString(),
        },
      ],
    }),
    201,
  );
}

test.describe('G. Календарь и аналитика тренера', () => {
  test('TRAIN-07 назначение показывает обеим ролям дату, клиента и программу @core', async ({
    browser,
    context,
    api,
    linkedPair,
    runId,
  }) => {
    const { trainer, client, link } = linkedPair;
    const prepared = await createProgram(api, trainer, runId);
    const date = futureDate();
    const page = await seedSession(context, trainer);
    await openDate(page, date);
    const form = page.getByRole('dialog');
    await form.getByLabel('Время').fill('18:00');
    await form.getByRole('checkbox', { name: new RegExp(`Клиент ${runId}`) }).click();
    // Без выбора программы невозможно обещать обеим ролям одну и ту же тренировку.
    const programChoice = form.getByRole('combobox', { name: 'Программа тренировки' });
    await expect(programChoice).toBeVisible();
    await programChoice.selectOption(prepared.programId);
    const [created] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().endsWith('/api/v1/calendar/events') && r.request().method() === 'POST',
      ),
      form.getByRole('button', { name: 'Записать', exact: true }).click(),
    ]);
    expect(created.status()).toBe(201);
    const trainerMonth = await month(api, trainer, date);
    const clientMonth = await month(api, client, date);
    expect(trainerMonth.events).toContainEqual(
      expect.objectContaining({ date, type: 'with_clients' }),
    );
    expect(clientMonth.events).toContainEqual(
      expect.objectContaining({ date, type: 'with_clients' }),
    );
    expect(trainerMonth.events[0]).toMatchObject({
      program_id: prepared.programId,
      program_name: prepared.name,
    });
    expect(clientMonth.events[0]).toMatchObject({
      program_id: prepared.programId,
      program_name: prepared.name,
      date,
    });
    expect(trainerMonth.events[0].clients).toContainEqual(
      expect.objectContaining({ client_id: link.cardId }),
    );
    const clientContext = await browser.newContext();
    try {
      const clientPage = await seedSession(clientContext, client);
      await openDate(clientPage, date);
      await expect(
        clientPage.getByRole('dialog').getByText(`Программа: ${prepared.name}`),
      ).toBeVisible();
    } finally {
      await clientContext.close();
    }
  });

  test('TRAIN-08 перенос меняет дату назначения у обеих ролей @core', async ({
    context,
    api,
    linkedPair,
  }) => {
    const { trainer, client, link } = linkedPair;
    const date = futureDate();
    const movedDate = futureDate(3);
    const event = await createEvent(api, trainer, link.cardId, date);
    const page = await seedSession(context, trainer);
    await openDate(page, date);
    await page.getByRole('dialog').getByRole('button', { name: 'Изменить' }).click();
    const editor = page.getByRole('dialog');
    await expect(editor.getByLabel('Дата')).toBeEditable();
    await editor.getByLabel('Дата').fill(movedDate);
    await editor.getByRole('button', { name: 'Сохранить' }).click();
    await page.reload();
    const trainerMonth = await month(api, trainer, movedDate);
    const clientMonth = await month(api, client, movedDate);
    expect(trainerMonth.events.find((item) => item.id === event.id)?.date).toBe(movedDate);
    expect(clientMonth.events.find((item) => item.id === event.id)?.date).toBe(movedDate);
  });

  test('TRAIN-08 отмена убирает назначение и старый счётчик @core', async ({
    context,
    api,
    linkedPair,
  }) => {
    const { trainer, client, link } = linkedPair;
    const date = futureDate();
    const event = await createEvent(api, trainer, link.cardId, date);
    const page = await seedSession(context, trainer);
    await openDate(page, date);
    const [cancelled] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().endsWith(`/api/v1/calendar/events/${event.id}`) &&
          r.request().method() === 'DELETE',
      ),
      page.getByRole('dialog').getByRole('button', { name: 'Отменить' }).click(),
    ]);
    expect(cancelled.status()).toBe(204);
    await page.reload();
    const trainerMonth = await month(api, trainer, date);
    const clientMonth = await month(api, client, date);
    expect(trainerMonth.events.find((item) => item.id === event.id)?.status).toBe('cancelled');
    expect(clientMonth.events.find((item) => item.id === event.id)?.status).toBe('cancelled');
    expect(trainerMonth.stats.planned).toBe(0);
    expect(clientMonth.stats.planned).toBe(0);
    expect(trainerMonth.stats.with_clients).toBe(0);
    expect(clientMonth.stats.with_clients).toBe(0);
  });

  test('TRAIN-09 тренер видит точные замеры и тренировочную аналитику связанного клиента @core', async ({
    context,
    api,
    linkedPair,
    runId,
  }) => {
    const { trainer, client, link } = linkedPair;
    const measured = await api.expectOk<{ items: { date: string; weight: number }[] }>(
      'client onboarding measurement',
      api.get('/api/v1/measurements', client.tokens),
      200,
    );
    const prepared = await createProgram(api, trainer, runId);
    await clientWorkout(api, trainer, link.cardId, prepared);
    const page = await seedSession(context, trainer);
    await page.goto(connectionMeasurements(link.cardId));
    await expect(
      page
        .getByRole('button', { name: /Замер за/ })
        .filter({ hasText: `${measured.items[0].weight} кг` }),
    ).toBeVisible();
    await page.goto(paths.analytics);
    await page
      .getByRole('tablist', { name: 'Просмотр данных' })
      .getByRole('tab', { name: 'Клиенты' })
      .click();
    await page.getByRole('combobox', { name: 'Выберите клиента' }).selectOption(link.cardId);
    await expect(page.getByText(prepared.exerciseName)).toBeVisible();
    // Числа берутся из серверной сессии клиента, а не из собственной тренировки.
    await expect
      .poll(() => page.getByText('Средний вес').evaluate((node) => node.parentElement?.textContent))
      .toBe('Средний вес52.5');
    await expect
      .poll(() =>
        page.getByText('Средний повт.').evaluate((node) => node.parentElement?.textContent),
      )
      .toBe('Средний повт.10');
    await expect
      .poll(() =>
        page.getByText('Общее кол-во').evaluate((node) => node.parentElement?.textContent),
      )
      .toBe('Общее кол-во1');
  });

  test('TRAIN-10 клиент видит имя тренера в записи «С тренером» @core', async ({
    context,
    api,
    linkedPair,
    runId,
  }) => {
    const { trainer, client, link } = linkedPair;
    const date = futureDate();
    await createEvent(api, trainer, link.cardId, date);
    const page = await seedSession(context, client);
    await openDate(page, date);
    const event = page.getByRole('dialog');
    await expect(event.getByText('С тренером')).toBeVisible();
    await expect(event.getByText(`Тренер ${runId}`)).toBeVisible();
    await expect(event.getByText(`Клиент ${runId}`)).toHaveCount(0);
  });

  test('TRAIN-10 отменённая тренером запись исчезает из счётчика клиента @core', async ({
    context,
    api,
    linkedPair,
  }) => {
    const { trainer, client, link } = linkedPair;
    const date = futureDate();
    const event = await createEvent(api, trainer, link.cardId, date);
    const cancelled = await api.delete(`/api/v1/calendar/events/${event.id}`, trainer.tokens);
    expect(cancelled.status()).toBe(204);
    const page = await seedSession(context, client);
    await showMonth(page, date);
    const clientMonth = await month(api, client, date);
    expect(clientMonth.events.find((item) => item.id === event.id)?.status).toBe('cancelled');
    expect(clientMonth.stats.with_clients).toBe(0);
    expect(clientMonth.stats.planned).toBe(0);
    await expect
      .poll(() =>
        page
          .getByText('С тренером')
          .first()
          .evaluate((node) => node.parentElement?.textContent),
      )
      .toBe('0С тренером');
  });
});
