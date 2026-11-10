import { activateSubscription } from '../fixtures/commerce.ts';
import type { Page } from '@playwright/test';

import { seedSession } from '../fixtures/accounts.ts';
import type { Api } from '../fixtures/api.ts';
import type { Session } from '../fixtures/accounts.ts';
import { finishWorkout } from '../fixtures/data.ts';
import type { ProgramFixture } from '../fixtures/data.ts';
import { expect, test } from '../fixtures/test.ts';
import { paths, program, programSession, programStart, workoutSummary } from '../support/paths.ts';
import type { components } from '../../frontend/src/shared/api/schema.d.ts';

/** Section E of docs/e2e-spec.md: the browser owns the active draft and finish action. */
type Summary = components['schemas']['SessionSummaryOut'];
type History = components['schemas']['ExerciseHistoryOut'];
type Program = components['schemas']['ProgramOut'];

async function start(page: Page, fixture: ProgramFixture): Promise<void> {
  await page.goto(program(fixture.programId));
  await page.getByRole('button', { name: 'Начать тренировку' }).click();
  await expect(page).toHaveURL(programStart(fixture.programId));
  await expect(page.getByRole('heading', { name: /Выбор дня|Выбор тренирующегося/ })).toBeVisible();
  await page.getByRole('button', { name: 'День 1' }).click();
  await page.getByRole('button', { name: 'Старт', exact: true }).click();
  await expect(page).toHaveURL(programSession(fixture.programId));
  await expect(page.getByRole('button', { name: 'Завершить тренировку' })).toBeVisible();
}

async function logSet(page: Page, weight: string, reps: string): Promise<void> {
  await page.getByLabel('КГ', { exact: true }).fill(weight);
  await page.getByRole('spinbutton', { name: 'Повторы' }).fill(reps);
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  await expect(page.getByRole('button', { name: `${Number(weight)} кг × ${reps}` })).toBeVisible();
}

async function confirmFinish(page: Page): Promise<Summary> {
  await page.getByRole('button', { name: 'Завершить тренировку' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Завершить тренировку?' })).toBeVisible();
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().endsWith('/api/v1/workouts/sessions/sync'),
    ),
    dialog.getByRole('button', { name: 'Завершить', exact: true }).click(),
  ]);
  expect(response.status()).toBe(201);
  const summary = (await response.json()) as Summary;
  await expect(page).toHaveURL(workoutSummary(summary.session_id));
  return summary;
}

async function history(api: Api, session: Session, variantId: string): Promise<History> {
  return api.expectOk<History>(
    'exercise history',
    api.get(`/api/v1/workouts/history/by-variant/${variantId}`, session.tokens),
    200,
  );
}

async function waitForDraftPersisted(page: Page, weight: number, reps: number): Promise<void> {
  // Запись Zustand в IndexedDB асинхронна: закрытие вкладки сразу после клика
  // проверяло бы гонку теста, а не восстановление черновика приложения.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<string>((resolve) => {
            const opening = indexedDB.open('keyval-store');
            opening.onerror = () => resolve('');
            opening.onsuccess = () => {
              const database = opening.result;
              const request = database
                .transaction('keyval', 'readonly')
                .objectStore('keyval')
                .get('dopafit.workout');
              request.onerror = () => {
                database.close();
                resolve('');
              };
              request.onsuccess = () => {
                database.close();
                resolve(typeof request.result === 'string' ? request.result : '');
              };
            };
          }),
      ),
    )
    .toContain(`"weight":${weight},"reps":${reps}`);
}

async function alternativeProgram(
  api: Api,
  client: Session,
  runId: string,
): Promise<{
  fixture: ProgramFixture;
  alternate: { id: string; name: string };
}> {
  const catalog = await api.expectOk<{ items: { id: string; name: string }[] }>(
    'catalog for alternative',
    api.get('/api/v1/exercises?limit=3', client.tokens),
    200,
  );
  if (catalog.items.length < 2) throw new Error('Catalog needs two exercises');
  const [primary, secondary] = catalog.items;
  const created = await api.expectOk<Program>(
    'program with alternative',
    api.post('/api/v1/programs', client.tokens, {
      name: `Альтернативы ${runId}`,
      days: [
        {
          name: 'День 1',
          position: 0,
          slots: [
            {
              position: 0,
              exercises: [
                { exercise_id: primary.id, sets: 2, reps: 8, variant_order: 0 },
                { exercise_id: secondary.id, sets: 2, reps: 8, variant_order: 1 },
              ],
            },
          ],
        },
      ],
    }),
    201,
  );
  const day = created.days[0];
  const slot = day.slots[0];
  return {
    fixture: {
      programId: created.id,
      dayId: day.id,
      slotId: slot.id,
      variantId: slot.exercises[0].id,
      exerciseId: primary.id,
      exerciseName: primary.name,
      name: created.name,
      sets: 2,
      reps: 8,
    },
    alternate: { id: slot.exercises[1].id, name: secondary.name },
  };
}

test.describe('E. Тренировка и история', () => {
  test('WORK-01 клиент записывает подходы и видит точные итоги и историю @smoke', async ({
    context,
    freshClient,
    programFixture,
    api,
  }) => {
    const page = await seedSession(context, freshClient);
    await start(page, programFixture);
    await logSet(page, '52.5', '8');
    await logSet(page, '55', '7');
    const summary = await confirmFinish(page);
    expect(summary.exercises[0]).toMatchObject({
      name: programFixture.exerciseName,
      max: { value: 55 },
      min: { value: 52.5 },
    });
    await expect(
      page.getByRole('heading', { name: `Итоги тренировки #${summary.seq_number}` }),
    ).toBeVisible();
    // Дата итогов должна быть днём реального завершения, а не стартом тренировки.
    await expect(
      page.getByText(
        new Intl.DateTimeFormat('ru-RU', {
          timeZone: 'Europe/Moscow',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
          .format(new Date(summary.finished_at))
          .replace(' г.', ''),
        { exact: false },
      ),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: programFixture.exerciseName })).toBeVisible();
    const saved = await history(api, freshClient, programFixture.variantId);
    expect(
      saved.days.flatMap((day) => day.entries.map(({ weight, reps }) => ({ weight, reps }))),
    ).toEqual([
      { weight: 52.5, reps: 8 },
      { weight: 55, reps: 7 },
    ]);
  });

  test('WORK-02 выбранная альтернатива попадает в историю, шаблон не меняется @core', async ({
    context,
    freshClient,
    api,
    runId,
  }) => {
    const { fixture, alternate } = await alternativeProgram(api, freshClient, runId);
    const page = await seedSession(context, freshClient);
    await start(page, fixture);
    await page.getByRole('button', { name: alternate.name, exact: true }).click();
    await expect(page.getByRole('button', { name: alternate.name, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await logSet(page, '42', '8');
    await confirmFinish(page);
    const saved = await history(api, freshClient, alternate.id);
    expect(
      saved.days.flatMap((day) => day.entries.map((entry) => [entry.weight, entry.reps])),
    ).toEqual([[42, 8]]);
    const template = await api.expectOk<Program>(
      'unchanged template',
      api.get(`/api/v1/programs/${fixture.programId}`, freshClient.tokens),
      200,
    );
    expect(template.days[0].slots[0].exercises.map((item) => item.id)).toEqual([
      fixture.variantId,
      alternate.id,
    ]);
  });

  test('WORK-02 возврат к основному варианту сохраняет подходы @core @mobile', async ({
    context,
    freshClient,
    api,
    runId,
  }) => {
    const { fixture, alternate } = await alternativeProgram(api, freshClient, runId);
    const page = await seedSession(context, freshClient);
    await start(page, fixture);
    await logSet(page, '40', '8');
    await waitForDraftPersisted(page, 40, 8);
    await page.getByRole('button', { name: alternate.name, exact: true }).click();
    await page.reload();
    await context.setOffline(true);
    await page.getByRole('button', { name: fixture.exerciseName, exact: true }).click();
    await expect(
      page.getByRole('button', { name: fixture.exerciseName, exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: '40 кг × 8' })).toBeVisible();
    const checkbox = page.getByRole('checkbox', { name: 'Выполнено', exact: true });
    await checkbox.check();
    await expect(checkbox).toBeChecked();
    await checkbox.uncheck();
    await logSet(page, '45', '6');
    await context.setOffline(false);
    const summary = await confirmFinish(page);
    expect(summary.exercises[0].name).toBe(fixture.exerciseName);
    const saved = await history(api, freshClient, fixture.variantId);
    expect(
      saved.days.flatMap((day) => day.entries.map((entry) => [entry.weight, entry.reps])),
    ).toEqual([
      [40, 8],
      [45, 6],
    ]);
  });

  test('WORK-13 Premium явно объясняет таймер и отправку результатов @core @narrow', async ({
    context,
    freshClient,
    programFixture,
  }, testInfo) => {
    const page = await seedSession(context, freshClient);
    await start(page, programFixture);
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme });
      const locked = page.getByRole('button', { name: 'Таймер отдыха · Premium' });
      await expect(locked).toBeVisible();
      await locked.click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByText(/Таймер отдыха доступен с Premium/)).toBeVisible();
      await expect(dialog.getByRole('link', { name: 'Подробнее о Premium' })).toHaveAttribute(
        'href',
        paths.settingsSubscription,
      );
      await dialog.getByRole('button', { name: 'Закрыть' }).click();
      await page.screenshot({ path: testInfo.outputPath(`workout-${theme}.png`), fullPage: true });
    }
    const field = page.getByRole('spinbutton', { name: 'Повторы' });
    await field.fill('8');
    await page.getByLabel('КГ', { exact: true }).fill('40');
    await page.getByRole('button', { name: 'Добавить', exact: true }).click();
    await confirmFinish(page);
    const share = page.getByRole('button', { name: 'Поделиться результатом · Premium' });
    await expect(share).toBeEnabled();
    await share.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/Отправка карточки.*Premium/)).toBeVisible();
    await dialog.getByRole('link', { name: 'Подробнее о Premium' }).click();
    await expect(page).toHaveURL(paths.settingsSubscription);
    await page.getByRole('button', { name: 'Подключить Premium бесплатно' }).click();
    await expect(page.getByText('Premium подключён', { exact: true })).toBeVisible();
  });

  test('WORK-14 пояснение таймера закрывается пользователем @core @mobile', async ({
    context,
    freshClient,
    programFixture,
    api,
  }) => {
    await activateSubscription(api, freshClient);
    const page = await seedSession(context, freshClient);
    await start(page, programFixture);
    await page.getByRole('button', { name: 'Как работает таймер отдыха' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/после записи нового подхода/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Понятно' }).click();
    await expect(dialog).not.toBeVisible();
    await logSet(page, '40', '8');
    await expect(page.getByText('Отдых', { exact: true })).toBeVisible();
  });

  test('WORK-03 черновик переживает вкладки приложения и reload @core', async ({
    context,
    freshClient,
    programFixture,
  }) => {
    const page = await seedSession(context, freshClient);
    await start(page, programFixture);
    await logSet(page, '48', '9');
    await waitForDraftPersisted(page, 48, 9);
    await page.getByRole('link', { name: 'Настройки' }).click();
    await expect(page).toHaveURL(paths.settings);
    await page.goto(programSession(programFixture.programId));
    await page.reload();
    await expect(page.getByRole('button', { name: '48 кг × 9' })).toBeVisible();
    await expect(page.getByText('1/3')).toBeVisible();
  });

  test('WORK-04 черновик восстанавливается после закрытия вкладки @core', async ({
    context,
    freshClient,
    programFixture,
  }) => {
    const page = await seedSession(context, freshClient);
    await start(page, programFixture);
    await logSet(page, '47.5', '6');
    await waitForDraftPersisted(page, 47.5, 6);
    await page.close();
    const reopened = await context.newPage();
    await reopened.goto(programSession(programFixture.programId));
    await expect(reopened.getByRole('button', { name: '47.5 кг × 6' })).toBeVisible();
    await expect(reopened.getByText('1/3')).toBeVisible();
  });

  test('WORK-05 неполная тренировка требует подтверждения и не создаёт пустые подходы @core', async ({
    context,
    freshClient,
    programFixture,
    api,
  }) => {
    const page = await seedSession(context, freshClient);
    await start(page, programFixture);
    await logSet(page, '40', '5');
    await page.getByRole('button', { name: 'Завершить тренировку' }).click();
    const dialog = page.getByRole('dialog');
    await expect(
      dialog.getByText('Результаты подходов сохранятся, продолжить эту тренировку будет нельзя.'),
    ).toBeVisible();
    await dialog.getByRole('button', { name: 'Отмена' }).click();
    await expect(page).toHaveURL(programSession(programFixture.programId));
    expect((await history(api, freshClient, programFixture.variantId)).days).toHaveLength(0);
    const summary = await confirmFinish(page);
    expect(summary.exercises[0].max.value).toBe(40);
    const entries = (await history(api, freshClient, programFixture.variantId)).days.flatMap(
      (day) => day.entries,
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ weight: 40, reps: 5 });
  });

  test('WORK-06 двойное подтверждение создаёт одну сессию @core', async ({
    context,
    freshClient,
    programFixture,
    api,
  }) => {
    const page = await seedSession(context, freshClient);
    await start(page, programFixture);
    await logSet(page, '50', '8');
    await page.getByRole('button', { name: 'Завершить тренировку' }).click();
    const responses: number[] = [];
    page.on('response', (response) => {
      if (
        response.request().method() === 'POST' &&
        response.url().endsWith('/api/v1/workouts/sessions/sync')
      )
        responses.push(response.status());
    });
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Завершить', exact: true })
      .dblclick();
    await expect(page.getByRole('heading', { name: 'Итоги тренировки #1' })).toBeVisible();
    expect(responses).toEqual([201]);
    const saved = await history(api, freshClient, programFixture.variantId);
    expect(saved.days.flatMap((day) => day.entries)).toHaveLength(1);
  });

  test('WORK-07 URL итогов восстанавливается после reload и в новой вкладке @core @security', async ({
    context,
    freshClient,
    finishedWorkout,
  }) => {
    const page = await seedSession(context, freshClient);
    await page.goto(workoutSummary(finishedWorkout.sessionId));
    await expect(
      page.getByRole('heading', { name: `Итоги тренировки #${finishedWorkout.seqNumber}` }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('heading', { name: `Итоги тренировки #${finishedWorkout.seqNumber}` }),
    ).toBeVisible();
    const another = await context.newPage();
    await another.goto(workoutSummary(finishedWorkout.sessionId));
    await expect(
      another.getByRole('heading', { name: `Итоги тренировки #${finishedWorkout.seqNumber}` }),
    ).toBeVisible();
  });

  test('WORK-08 чужой аккаунт не видит итоги, владелец видит их @core @security', async ({
    browser,
    context,
    freshClient,
    freshTrainer,
    finishedWorkout,
  }) => {
    const stranger = await browser.newContext({
      baseURL: process.env.E2E_BASE_URL ?? 'http://frontend-e2e:5173',
    });
    try {
      const otherPage = await seedSession(stranger, freshTrainer);
      await otherPage.goto(workoutSummary(finishedWorkout.sessionId));
      await expect(otherPage.getByRole('heading', { name: 'Итоги недоступны' })).toBeVisible();
      await expect(otherPage.getByText(finishedWorkout.program.exerciseName)).toHaveCount(0);
      const owner = await seedSession(context, freshClient);
      await owner.goto(workoutSummary(finishedWorkout.sessionId));
      await expect(
        owner.getByRole('heading', { name: `Итоги тренировки #${finishedWorkout.seqNumber}` }),
      ).toBeVisible();
    } finally {
      await stranger.close();
    }
  });

  test('WORK-09 удаление программы сохраняет детальную историю тренировки @core', async ({
    context,
    freshClient,
    finishedWorkout,
    api,
  }) => {
    const page = await seedSession(context, freshClient);
    await page.goto(program(finishedWorkout.program.programId));
    await page.getByRole('button', { name: 'Удалить программу' }).click();
    const [removed] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.request().method() === 'DELETE' &&
          r.url().endsWith(`/api/v1/programs/${finishedWorkout.program.programId}`),
      ),
      page.getByRole('dialog').getByRole('button', { name: 'Удалить', exact: true }).click(),
    ]);
    expect(removed.status()).toBe(204);
    await expect(page).toHaveURL(paths.programs);
    const saved = await history(api, freshClient, finishedWorkout.program.variantId);
    expect(
      saved.days.flatMap((day) => day.entries.map(({ weight, reps }) => ({ weight, reps }))),
    ).toEqual(finishedWorkout.sets);
  });

  test('WORK-10 история упражнения хранит последовательность и рекорд @core', async ({
    context,
    freshClient,
    programFixture,
    api,
  }) => {
    await finishWorkout(api, freshClient, programFixture, {
      sets: [
        { weight: 50, reps: 10 },
        { weight: 55, reps: 8 },
      ],
    });
    const page = await seedSession(context, freshClient);
    await start(page, programFixture);
    await expect(page.getByRole('button', { name: '50 кг × 10' })).toBeVisible();
    await expect(page.getByRole('button', { name: '55 кг × 8' })).toBeVisible();
    await logSet(page, '60', '6');
    const summary = await confirmFinish(page);
    expect(summary.exercises[0].max.value).toBe(60);
    expect(summary.exercises[0].max.delta).toBeGreaterThan(0);
    const saved = await history(api, freshClient, programFixture.variantId);
    expect(
      saved.days.flatMap((day) => day.entries.map(({ weight, reps }) => ({ weight, reps }))),
    ).toEqual([
      { weight: 50, reps: 10 },
      { weight: 55, reps: 8 },
      { weight: 60, reps: 6 },
    ]);
  });

  test('WORK-11 карточка результата совпадает с историей и не создаёт ложный рекорд @core', async ({
    context,
    freshClient,
    finishedWorkout,
    api,
  }) => {
    await activateSubscription(api, freshClient);
    const page = await seedSession(context, freshClient);
    await start(page, finishedWorkout.program);
    await logSet(page, '40', '5');
    const summary = await confirmFinish(page);
    const saved = await history(api, freshClient, finishedWorkout.program.variantId);
    expect(saved.days.flatMap((day) => day.entries)).toHaveLength(3);
    expect(summary.exercises[0].max.value).toBe(40);
    expect(summary.exercises[0].max.delta).toBeLessThan(0);
    const downloadPromise = page.waitForEvent('download');
    // Карточка рендерится вне экрана и скрыта от accessibility tree перед
    // растеризацией. Это единственное место, где у неё нет доступного имени.
    const cardHasNumbers = expect(page.getByTestId('result-card')).toContainText(
      `MAX: ${summary.exercises[0].max.value} кг`,
    );
    await page.getByRole('button', { name: 'Поделиться результатом' }).click();
    await cardHasNumbers;
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('dopafit-workout.png');
    await expect(page.getByText('Карточка сохранена')).toBeVisible();
  });

  test('WORK-12 ошибочные границы отклоняются, исправленные значения сохраняются @core', async ({
    context,
    freshClient,
    programFixture,
    api,
  }) => {
    const page = await seedSession(context, freshClient);
    await start(page, programFixture);
    const add = page.getByRole('button', { name: 'Добавить', exact: true });
    await page.getByLabel('КГ', { exact: true }).fill('2001');
    await page.getByRole('spinbutton', { name: 'Повторы' }).fill('0');
    await expect(add).toBeDisabled();
    await expect(page.getByText('Вес от 0 до 2000 кг', { exact: true })).toBeVisible();
    await expect(page.getByText('От 1 до 999 повторов', { exact: true })).toBeVisible();
    await page.getByLabel('КГ', { exact: true }).fill('0');
    await page.getByRole('spinbutton', { name: 'Повторы' }).fill('999');
    await expect(add).toBeEnabled();
    await add.click();
    await expect(page.getByRole('button', { name: '0 кг × 999' })).toBeVisible();
    await confirmFinish(page);
    const saved = await history(api, freshClient, programFixture.variantId);
    expect(
      saved.days.flatMap((day) => day.entries.map(({ weight, reps }) => ({ weight, reps }))),
    ).toEqual([{ weight: 0, reps: 999 }]);
  });
});
