import { seedSession } from '../fixtures/accounts.ts';
import type { Api } from '../fixtures/api.ts';
import type { Session } from '../fixtures/accounts.ts';
import { expect, test } from '../fixtures/test.ts';
import { createProgram } from '../fixtures/data.ts';
import { ProgramEditor } from '../pages/program-editor.ts';
import { paths, program, programEdit } from '../support/paths.ts';
import type { components } from '../../frontend/src/shared/api/schema.d.ts';

/**
 * Section D of docs/e2e-spec.md.
 *
 * Редактор здесь сам предмет проверки: день, выбор упражнения и параметры
 * вводятся через UI, чтобы тесты видели ошибки пользовательского сценария.
 */
const CATALOG_EXERCISE = 'Жим штанги лёжа';
const SECOND_EXERCISE = 'Приседания со штангой';
const THIRD_EXERCISE = 'Тяга штанги в наклоне';
const FOURTH_EXERCISE = 'Выпады';
type ProgramOut = components['schemas']['ProgramOut'];
type ProgramListItem = components['schemas']['ProgramListItem'];

async function catalogId(api: Api, session: Session, name: string): Promise<string> {
  const page = await api.expectOk<{ items: { id: string; name: string }[] }>(
    `catalog ${name}`,
    api.get(`/api/v1/exercises?search=${encodeURIComponent(name)}`, session.tokens),
    200,
  );
  const item = page.items.find((entry) => entry.name === name);
  if (!item) throw new Error(`Catalog exercise absent: ${name}`);
  return item.id;
}

async function preparedProgram(
  api: Api,
  session: Session,
  runId: string,
  options: { alternate?: boolean; count?: number } = {},
): Promise<ProgramOut> {
  const names = [CATALOG_EXERCISE, SECOND_EXERCISE, THIRD_EXERCISE, FOURTH_EXERCISE];
  const ids = await Promise.all(names.map((name) => catalogId(api, session, name)));
  return api.expectOk<ProgramOut>(
    'prepare program',
    api.post('/api/v1/programs', session.tokens, {
      name: `Программа ${runId}`,
      days: [
        {
          name: 'День 1',
          position: 0,
          slots: names.slice(0, options.count ?? 2).map((_, position) => ({
            position,
            exercises: [
              {
                exercise_id: ids[position],
                sets: 4 + position,
                reps: 8 + position,
                variant_order: 0,
              },
              ...(position === 0 && options.alternate
                ? [{ exercise_id: ids[3], sets: 3, reps: 12, variant_order: 1 }]
                : []),
            ],
          })),
        },
      ],
    }),
    201,
  );
}

async function readProgram(api: Api, session: Session, id: string): Promise<ProgramOut> {
  return api.expectOk<ProgramOut>(
    'read program',
    api.get(`/api/v1/programs/${id}`, session.tokens),
    200,
  );
}

function primaryNames(value: ProgramOut): string[] {
  return value.days[0].slots.map(
    (slot) => slot.exercises.find((item) => item.variant_order === 0)!.name,
  );
}

async function openOwnList(page: import('@playwright/test').Page): Promise<void> {
  await page.goto(paths.programs);
  await page.getByRole('tab', { name: 'Мои программы' }).click();
}

test.describe('D. Программы и редактор', () => {
  test('PROG-01 клиент создаёт программу с днём и упражнением @smoke', async ({
    context,
    clientSession,
    runId,
  }) => {
    const programName = `Программа ${runId}`;
    const page = await seedSession(context, clientSession);

    await page.goto(paths.programNew);
    await expect(page.getByRole('heading', { name: 'Новая программа' })).toBeVisible();
    await page.getByPlaceholder('Название программы').fill(programName);

    await page.getByRole('button', { name: 'Добавить день' }).click();
    const dayDialog = page.getByRole('dialog');
    await dayDialog.getByPlaceholder('Название дня').fill('День 1');
    await dayDialog.getByRole('button', { name: 'Добавить', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'День 1' })).toBeVisible();

    await page.getByRole('button', { name: 'Добавить упражнение' }).click();
    const exerciseDialog = page.getByRole('dialog');
    // Упражнение выбирается из каталога, а не вводится своим названием: у
    // выбранного есть exercise_id, и программа ссылается на каталог.
    await exerciseDialog.getByPlaceholder('Название упражнения').fill(CATALOG_EXERCISE);
    await exerciseDialog.getByRole('button', { name: CATALOG_EXERCISE, exact: true }).click();
    await exerciseDialog.getByPlaceholder('Подходы').fill('4');
    await exerciseDialog.getByPlaceholder('Повторения').fill('8');
    await exerciseDialog.getByRole('button', { name: 'Добавить', exact: true }).click();
    await expect(exerciseDialog).toBeHidden();

    // Ждём именно ответ сервера: сохранение офлайн уходит в outbox и экран
    // уехал бы на каталог одинаково в обоих случаях.
    const [created] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' && response.url().endsWith('/api/v1/programs'),
      ),
      page.getByRole('button', { name: 'Сохранить программу' }).click(),
    ]);
    expect(created.status()).toBe(201);
    await expect(page).toHaveURL(new RegExp(`${paths.programs}$`));

    // Оракул — состояние после перезагрузки: оптимистичная запись в списке
    // доказывала бы только локальный кэш.
    await page.reload();
    await page.getByRole('tab', { name: 'Мои программы' }).click();
    const row = page.getByRole('link').filter({ hasText: programName });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('1 дн.');
    await expect(row).toContainText('1 упр.');
  });

  test('PROG-01 создание программы работает через touch mobile @smoke @mobile', async ({
    context,
    freshClient,
    runId,
  }) => {
    const page = await seedSession(context, freshClient);
    const editor = new ProgramEditor(page);
    const name = `Мобильная программа ${runId}`;
    await editor.openNew();
    await editor.setName(name);
    await editor.addDay('День 1');
    await editor.addExercise(0, CATALOG_EXERCISE, 4, 8);
    expect(await editor.save('POST')).toBe(201);
    await openOwnList(page);
    await page.reload();
    await page.getByRole('tab', { name: 'Мои программы' }).click();
    const row = page.getByRole('link').filter({ hasText: name });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('1 дн. · 1 упр.');
  });

  test('PROG-02 пустая программа не сохраняется и объясняет причину @core', async ({
    context,
    freshClient,
    api,
  }) => {
    const page = await seedSession(context, freshClient);
    const editor = new ProgramEditor(page);
    await editor.openNew();
    await expect(page.getByRole('button', { name: 'Сохранить программу' })).toBeDisabled();
    await editor.setName('Программа без упражнений');
    await expect(page.getByRole('button', { name: 'Сохранить программу' })).toBeDisabled();
    await editor.addDay('День 1');
    await expect(page.getByRole('button', { name: 'Сохранить программу' })).toBeDisabled();
    const list = await api.expectOk<ProgramListItem[]>(
      'list programs',
      api.get('/api/v1/programs', freshClient.tokens),
      200,
    );
    expect(list.filter((item) => item.name === 'Программа без упражнений')).toHaveLength(0);
  });

  test('PROG-03 порядок дней и упражнений сохраняется после нового входа @core', async ({
    browser,
    context,
    freshClient,
    runId,
    api,
  }) => {
    const page = await seedSession(context, freshClient);
    const editor = new ProgramEditor(page);
    const name = `Порядок ${runId}`;
    await editor.openNew();
    await editor.setName(name);
    await editor.addDay('День А');
    await editor.addExercise(0, CATALOG_EXERCISE, 4, 8);
    await editor.addExercise(0, SECOND_EXERCISE, 5, 9);
    await editor.addDay('День Б');
    await editor.addExercise(1, THIRD_EXERCISE, 3, 12);
    expect(await editor.save('POST')).toBe(201);
    const list = await api.expectOk<ProgramListItem[]>(
      'list programs',
      api.get('/api/v1/programs', freshClient.tokens),
      200,
    );
    const created = list.find((item) => item.name === name);
    expect(created).toBeDefined();
    const another = await browser.newContext();
    try {
      const reopened = await seedSession(another, freshClient);
      await reopened.goto(program(created!.id));
      await expect(reopened.getByRole('button', { name: 'День А' })).toBeVisible();
      await expect(reopened.getByRole('button', { name: 'День Б' })).toBeVisible();
      const saved = await readProgram(api, freshClient, created!.id);
      expect(saved.days.map((day) => day.name)).toEqual(['День А', 'День Б']);
      expect(primaryNames(saved)).toEqual([CATALOG_EXERCISE, SECOND_EXERCISE]);
      expect(saved.days[1].slots[0].exercises[0].name).toBe(THIRD_EXERCISE);
    } finally {
      await another.close();
    }
  });

  test('PROG-04 название, день и параметры изменяются после сохранения @core', async ({
    context,
    freshClient,
    programFixture,
    api,
  }) => {
    const page = await seedSession(context, freshClient);
    const editor = new ProgramEditor(page);
    await editor.openExisting(programFixture.programId);
    await editor.setName('Исправленная программа');
    await editor.renameDay(0, 'Новый день');
    const slot = editor.slot(programFixture.exerciseName);
    await expect(slot.getByRole('button', { name: 'Изменить параметры' })).toBeVisible();
    await slot.getByRole('button', { name: 'Изменить параметры' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('Подходы').fill('6');
    await dialog.getByPlaceholder('Повторения').fill('11');
    await dialog.getByRole('button', { name: 'Сохранить' }).click();
    expect(await editor.save('PUT', programFixture.programId)).toBe(200);
    await page.goto(program(programFixture.programId));
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Исправленная программа' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Новый день' })).toBeVisible();
    const saved = await readProgram(api, freshClient, programFixture.programId);
    expect(saved.days[0].slots[0].exercises[0]).toMatchObject({ sets: 6, reps: 11 });
  });

  test('PROG-05 альтернатива остаётся в одном слоте после reload @core', async ({
    context,
    freshClient,
    programFixture,
    api,
  }) => {
    const page = await seedSession(context, freshClient);
    const editor = new ProgramEditor(page);
    await editor.openExisting(programFixture.programId);
    await editor.addExercise(0, THIRD_EXERCISE, 3, 12, programFixture.exerciseName);
    expect(await editor.save('PUT', programFixture.programId)).toBe(200);
    await page.goto(program(programFixture.programId));
    await page.reload();
    await expect(page.getByText(THIRD_EXERCISE)).toBeVisible();
    const saved = await readProgram(api, freshClient, programFixture.programId);
    expect(saved.days[0].slots).toHaveLength(1);
    expect(saved.days[0].slots[0].exercises.map((item) => item.name)).toEqual([
      programFixture.exerciseName,
      THIRD_EXERCISE,
    ]);
  });

  test('PROG-06 drag мышью сохраняет порядок и альтернативу @smoke', async ({
    context,
    freshClient,
    runId,
    api,
  }) => {
    const prepared = await preparedProgram(api, freshClient, runId, { alternate: true });
    const page = await seedSession(context, freshClient);
    const editor = new ProgramEditor(page);
    await editor.openExisting(prepared.id);
    await editor.dragBelow(CATALOG_EXERCISE, SECOND_EXERCISE);
    await expect(page.getByRole('button', { name: /^Переместить:/ }).first()).toHaveAttribute(
      'aria-label',
      `Переместить: ${SECOND_EXERCISE}`,
    );
    await expect(editor.slot(CATALOG_EXERCISE)).toHaveCSS('transform', 'none');
    await page.getByRole('button', { name: 'Сохранить программу' }).click();
    await expect(page).toHaveURL(paths.programs);
    await page.goto(programEdit(prepared.id));
    await page.reload();
    const saved = await readProgram(api, freshClient, prepared.id);
    expect(primaryNames(saved)).toEqual([SECOND_EXERCISE, CATALOG_EXERCISE]);
    expect(saved.days[0].slots[1].exercises[1].name).toBe(FOURTH_EXERCISE);
  });

  test('PROG-07 touch drag сохраняет порядок на клиенте и сервере @core @mobile', async ({
    context,
    freshClient,
    runId,
    api,
  }) => {
    const prepared = await preparedProgram(api, freshClient, runId, { alternate: true });
    const page = await seedSession(context, freshClient);
    const editor = new ProgramEditor(page);
    await editor.openExisting(prepared.id);
    const from = await editor.slot(CATALOG_EXERCISE).boundingBox();
    const to = await editor.slot(SECOND_EXERCISE).boundingBox();
    if (!from || !to) throw new Error('Drag targets are not visible');
    const cdp = await context.newCDPSession(page);
    const start = { x: Math.round(from.x + from.width / 2), y: Math.round(from.y + 15) };
    const end = { x: Math.round(to.x + to.width / 2), y: Math.round(to.y + to.height / 2) };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
    // Сенсор ждёт удержания: поднятая карточка даёт наблюдаемый сигнал
    // активации без фиксированной паузы.
    await expect(editor.slot(CATALOG_EXERCISE)).toHaveAttribute('style', /z-index: 1/);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: end.x, y: end.y }],
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await editor.waitForDrop();
    await expect(page.getByRole('button', { name: /^Переместить:/ }).first()).toHaveAttribute(
      'aria-label',
      `Переместить: ${SECOND_EXERCISE}`,
    );
    await page.getByRole('button', { name: 'Сохранить программу' }).click();
    await expect(page).toHaveURL(paths.programs);
    await page.goto(programEdit(prepared.id));
    await page.reload();
    expect(primaryNames(await readProgram(api, freshClient, prepared.id))).toEqual([
      SECOND_EXERCISE,
      CATALOG_EXERCISE,
    ]);
  });

  test('PROG-08 обратная перестановка сохраняет параметры альтернативы @core', async ({
    context,
    freshClient,
    runId,
    api,
  }) => {
    const prepared = await preparedProgram(api, freshClient, runId, { alternate: true, count: 3 });
    const page = await seedSession(context, freshClient);
    const editor = new ProgramEditor(page);
    await editor.openExisting(prepared.id);
    await editor.dragAbove(THIRD_EXERCISE, CATALOG_EXERCISE);
    await expect(page.getByRole('button', { name: /^Переместить:/ }).first()).toHaveAttribute(
      'aria-label',
      `Переместить: ${THIRD_EXERCISE}`,
    );
    expect(await editor.save('PUT', prepared.id)).toBe(200);
    await page.goto(programEdit(prepared.id));
    await page.reload();
    const saved = await readProgram(api, freshClient, prepared.id);
    expect(primaryNames(saved)).toEqual([THIRD_EXERCISE, CATALOG_EXERCISE, SECOND_EXERCISE]);
    expect(saved.days[0].slots[1].exercises[1]).toMatchObject({
      name: FOURTH_EXERCISE,
      sets: 3,
      reps: 12,
    });
  });

  test('PROG-09 удаление слота не затрагивает соседний и альтернативу @core', async ({
    context,
    freshClient,
    runId,
    api,
  }) => {
    const prepared = await preparedProgram(api, freshClient, runId, { alternate: true });
    const page = await seedSession(context, freshClient);
    const editor = new ProgramEditor(page);
    await editor.openExisting(prepared.id);
    await editor.slot(SECOND_EXERCISE).getByRole('button', { name: 'Удалить упражнение' }).click();
    await expect(editor.slot(SECOND_EXERCISE)).toHaveCount(0);
    expect(await editor.save('PUT', prepared.id)).toBe(200);
    await page.goto(program(prepared.id));
    await page.reload();
    await expect(page.getByText(CATALOG_EXERCISE, { exact: true })).toBeVisible();
    await expect(page.getByText(FOURTH_EXERCISE, { exact: true })).toBeVisible();
    await expect(page.getByText(SECOND_EXERCISE)).toHaveCount(0);
    const saved = await readProgram(api, freshClient, prepared.id);
    expect(saved.days[0].slots).toHaveLength(1);
    expect(saved.days[0].slots[0].exercises.map((item) => item.name)).toEqual([
      CATALOG_EXERCISE,
      FOURTH_EXERCISE,
    ]);
  });

  test('PROG-10 копия стандартной программы независима от оригинала @core', async ({
    context,
    freshClient,
    api,
    runId,
  }) => {
    const standards = await api.expectOk<ProgramListItem[]>(
      'standard programs',
      api.get('/api/v1/programs?standard=true', freshClient.tokens),
      200,
    );
    const source = standards[0];
    if (!source) throw new Error('No standard program seeded');
    const original = await readProgram(api, freshClient, source.id);
    const page = await seedSession(context, freshClient);
    const editor = new ProgramEditor(page);
    await editor.openExisting(source.id);
    const copyName = `Копия ${runId}`;
    await editor.setName(copyName);
    const [response] = await Promise.all([
      page.waitForResponse(
        (r) => r.request().method() === 'POST' && r.url().endsWith('/api/v1/programs'),
      ),
      page.getByRole('button', { name: 'Сохранить копию' }).click(),
    ]);
    expect(response.status()).toBe(201);
    const copy = (await response.json()) as ProgramOut;
    expect(copy.id).not.toBe(original.id);
    await page.goto(program(copy.id));
    await page.reload();
    await expect(page.getByRole('heading', { name: copyName })).toBeVisible();
    expect((await readProgram(api, freshClient, original.id)).name).toBe(original.name);
  });

  test('PROG-11 отмена удаления сохраняет программу, подтверждение удаляет @core', async ({
    context,
    freshClient,
    programFixture,
    api,
  }) => {
    const page = await seedSession(context, freshClient);
    await page.goto(program(programFixture.programId));
    await page.getByRole('button', { name: 'Удалить программу' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Удалить программу?' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Отмена' }).click();
    await page.reload();
    await expect(page.getByRole('heading', { name: programFixture.name })).toBeVisible();
    await page.getByRole('button', { name: 'Удалить программу' }).click();
    const [deleted] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.request().method() === 'DELETE' &&
          r.url().endsWith(`/api/v1/programs/${programFixture.programId}`),
      ),
      dialog.getByRole('button', { name: 'Удалить', exact: true }).click(),
    ]);
    expect(deleted.status()).toBe(204);
    await openOwnList(page);
    await page.reload();
    await page.getByRole('tab', { name: 'Мои программы' }).click();
    await expect(page.getByRole('link').filter({ hasText: programFixture.name })).toHaveCount(0);
    const list = await api.expectOk<ProgramListItem[]>(
      'list programs',
      api.get('/api/v1/programs', freshClient.tokens),
      200,
    );
    expect(list.some((item) => item.id === programFixture.programId)).toBe(false);
  });

  test('PROG-12 программа тренера показывает клиенту автора и дни @core', async ({
    context,
    linkedPair,
    api,
    runId,
  }) => {
    const source = await createProgram(api, linkedPair.trainer, runId);
    const shared = await api.expectOk<ProgramListItem>(
      'share program',
      api.post(`/api/v1/programs/${source.programId}/share`, linkedPair.trainer.tokens, {
        client_id: linkedPair.link.cardId,
      }),
      200,
    );
    const page = await seedSession(context, linkedPair.client);
    await openOwnList(page);
    await expect(page.getByRole('link').filter({ hasText: source.name })).toHaveCount(1);
    await page.goto(program(shared.id));
    await page.reload();
    await expect(page.getByRole('button', { name: 'День 1' })).toBeVisible();
    await expect(page.getByText(source.exerciseName)).toBeVisible();
    await expect(page.getByText(`Тренер ${runId}`)).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Поделиться программой с клиентом' }),
    ).toHaveCount(0);
  });

  test('PROG-13 двойное сохранение создаёт одну программу @core', async ({
    context,
    freshClient,
    runId,
    api,
  }) => {
    const page = await seedSession(context, freshClient);
    const editor = new ProgramEditor(page);
    const name = `Двойное сохранение ${runId}`;
    await editor.openNew();
    await editor.setName(name);
    await editor.addDay('День 1');
    await editor.addExercise(0, CATALOG_EXERCISE, 4, 8);
    const responses: number[] = [];
    page.on('response', (r) => {
      if (r.request().method() === 'POST' && r.url().endsWith('/api/v1/programs'))
        responses.push(r.status());
    });
    await page.getByRole('button', { name: 'Сохранить программу' }).dblclick();
    await expect(page).toHaveURL(new RegExp(`${paths.programs}$`));
    await page.reload();
    await page.getByRole('tab', { name: 'Мои программы' }).click();
    await expect(page.getByRole('link').filter({ hasText: name })).toHaveCount(1);
    const list = await api.expectOk<ProgramListItem[]>(
      'list programs',
      api.get('/api/v1/programs', freshClient.tokens),
      200,
    );
    expect(list.filter((item) => item.name === name)).toHaveLength(1);
    expect(responses).toContain(201);
  });

  test('PROG-14 сбой сохранения сохраняет черновик для повтора @core', async ({
    context,
    freshClient,
    runId,
    api,
  }) => {
    test.setTimeout(60_000);
    const page = await seedSession(context, freshClient);
    const editor = new ProgramEditor(page);
    const name = `Черновик ${runId}`;
    await editor.openNew();
    await editor.setName(name);
    await editor.addDay('День 1');
    await editor.addExercise(0, CATALOG_EXERCISE, 4, 8);
    let failedRequests = 0;
    page.on('requestfailed', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/api/v1/programs')) {
        failedRequests += 1;
      }
    });
    await page.route('**/api/v1/programs', (route) => {
      if (route.request().method() === 'POST') return route.abort('failed');
      return route.continue();
    });
    await page.getByRole('button', { name: 'Сохранить программу' }).click();
    // Мутация повторяется трижды автоматически. Держим сеть сломанной до
    // исчерпания этих попыток, иначе успешный автоповтор обгонит проверку формы.
    await expect.poll(() => failedRequests, { timeout: 20_000 }).toBe(4);
    await expect(page).toHaveURL(paths.programNew);
    await expect(page.getByPlaceholder('Название программы')).toHaveValue(name);
    await expect(editor.slot(CATALOG_EXERCISE)).toBeVisible();
    await page.unroute('**/api/v1/programs');
    expect(await editor.save('POST')).toBe(201);
    await openOwnList(page);
    await page.reload();
    await page.getByRole('tab', { name: 'Мои программы' }).click();
    await expect(page.getByRole('link').filter({ hasText: name })).toHaveCount(1);
    const list = await api.expectOk<ProgramListItem[]>(
      'list programs',
      api.get('/api/v1/programs', freshClient.tokens),
      200,
    );
    expect(list.filter((item) => item.name === name)).toHaveLength(1);
  });

  test('PROG-15 второй редактор не перезаписывает более новую версию молча @core', async ({
    browser,
    freshClient,
    programFixture,
    api,
  }) => {
    const firstContext = await browser.newContext();
    const secondContext = await browser.newContext();
    try {
      const first = new ProgramEditor(await seedSession(firstContext, freshClient));
      const second = new ProgramEditor(await seedSession(secondContext, freshClient));
      await first.openExisting(programFixture.programId);
      await second.openExisting(programFixture.programId);
      await first.setName('Новая версия');
      expect(await first.save('PUT', programFixture.programId)).toBe(200);
      await second.setName('Устаревшая версия');
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
        'Устаревшая версия',
      );
      expect((await readProgram(api, freshClient, programFixture.programId)).name).toBe(
        'Новая версия',
      );
      await second.page.reload();
      await expect(second.page.getByPlaceholder('Название программы')).toHaveValue('Новая версия');
    } finally {
      await firstContext.close();
      await secondContext.close();
    }
  });

  async function viewportCheck(
    context: import('@playwright/test').BrowserContext,
    session: Session,
    width: number,
  ): Promise<void> {
    const page = await seedSession(context, session);
    const editor = new ProgramEditor(page);
    await editor.openNew();
    await editor.setName('Проверка ширины');
    await editor.addDay('День 1');
    await editor.addExercise(0, CATALOG_EXERCISE, 4, 8);
    await expect(editor.slot(CATALOG_EXERCISE)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Сохранить программу' })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  }

  test('PROG-16 редактор без переполнения на 320 px @narrow', async ({ context, freshClient }) => {
    await viewportCheck(context, freshClient, 320);
  });

  test('PROG-16 редактор без переполнения на 390 px @mobile', async ({ context, freshClient }) => {
    await viewportCheck(context, freshClient, 390);
  });

  test('PROG-16 редактор без переполнения на 430 px @large', async ({ context, freshClient }) => {
    await viewportCheck(context, freshClient, 430);
  });
});

test('PROG-02 неверные параметры объясняются, исправленная программа сохраняется @core', async ({
  context,
  freshClient,
  runId,
}) => {
  const page = await seedSession(context, freshClient);
  const editor = new ProgramEditor(page);
  const name = `Проверка полей ${runId}`;
  await editor.openNew();
  await editor.setName(name);
  await editor.addDay('День 1');
  await page.getByRole('button', { name: 'Добавить упражнение', exact: true }).click();
  await page.getByLabel('Название упражнения', { exact: true }).fill('Жим');
  await page.getByLabel('Подходы', { exact: true }).fill('100');
  await page.getByLabel('Повторения', { exact: true }).fill('1.5');
  await expect(page.getByText('От 1 до 99 подходов', { exact: true })).toBeVisible();
  await expect(page.getByText('Введите целое число повторов', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Добавить', exact: true })).toBeDisabled();
  await page.getByLabel('Подходы', { exact: true }).fill('3');
  await page.getByLabel('Повторения', { exact: true }).fill('10');
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  expect(await editor.save('POST')).toBe(201);
  await openOwnList(page);
  await page.reload();
  await page.getByRole('tab', { name: 'Мои программы' }).click();
  await page.getByRole('link').filter({ hasText: name }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
  await expect(page.getByText('3 подхода × 10 повторений', { exact: true })).toBeVisible();
});
