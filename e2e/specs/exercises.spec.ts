import { seedSession, DEV_VERIFICATION_CODE, type Session } from '../fixtures/accounts.ts';
import { uploadExerciseImage } from '../fixtures/photos.ts';
import { expect, test } from '../fixtures/test.ts';
import { exercise, program, paths } from '../support/paths.ts';

interface ExerciseItem {
  id: string;
  name: string;
  category_id: string;
  is_favorite: boolean;
}
interface ExercisePage {
  items: ExerciseItem[];
  total: number;
}
interface Category {
  id: string;
  name: string;
  exercise_count: number;
}

test.describe('C. Каталог упражнений', () => {
  test('EX-01 карточка упражнения возвращает к прежней позиции каталога @core', async ({
    context,
    freshClient,
    api,
  }) => {
    const list = await api.expectOk<ExercisePage>(
      'catalog',
      api.get('/api/v1/exercises', freshClient.tokens),
      200,
    );
    const item = list.items.at(-1)!;
    const page = await seedSession(context, freshClient);
    await page.goto(paths.exercises);
    await expect(page.getByText(`Найдено: ${list.total}`)).toBeVisible();
    await page.getByRole('main').evaluate((element, index) => {
      element.scrollTop = index * 100;
    }, list.items.length - 1);
    const link = page.getByRole('link', { name: new RegExp(item.name, 'i') });
    await link.scrollIntoViewIfNeeded();
    const before = await link.boundingBox();
    expect(before).not.toBeNull();
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${exercise(item.id)}$`));
    await expect(page.getByRole('heading', { name: item.name })).toBeVisible();
    await page.getByRole('button', { name: 'Назад' }).click();
    await expect(page).toHaveURL(new RegExp(`${paths.exercises}$`));
    const after = await page.getByRole('link', { name: new RegExp(item.name, 'i') }).boundingBox();
    expect(after).not.toBeNull();
    expect(Math.abs(after!.y - before!.y)).toBeLessThanOrEqual(80);
  });

  test('EX-02 поиск и очистка восстанавливают весь каталог @core', async ({
    context,
    freshClient,
    api,
  }) => {
    const list = await api.expectOk<ExercisePage>(
      'catalog',
      api.get('/api/v1/exercises', freshClient.tokens),
      200,
    );
    const item = list.items[0]!;
    const page = await seedSession(context, freshClient);
    await page.goto(paths.exercises);
    await expect(page.getByText(`Найдено: ${list.total}`)).toBeVisible();
    const search = page.getByRole('searchbox', { name: 'Поиск упражнения' });
    await search.fill(item.name);
    await expect(page.getByRole('link', { name: new RegExp(item.name, 'i') })).toBeVisible();
    await expect(page.getByText('Найдено: 1')).toBeVisible();
    await search.fill('');
    await expect(page.getByText(`Найдено: ${list.total}`)).toBeVisible();
    await page.reload();
    await expect(page.getByText(`Найдено: ${list.total}`)).toBeVisible();
  });

  test('EX-03 категория сохраняет поисковый запрос @core', async ({
    context,
    freshClient,
    api,
  }) => {
    const list = await api.expectOk<ExercisePage>(
      'catalog',
      api.get('/api/v1/exercises', freshClient.tokens),
      200,
    );
    const categories = await api.expectOk<Category[]>(
      'categories',
      api.get('/api/v1/exercises/categories', freshClient.tokens),
      200,
    );
    const item = list.items[0]!;
    const ownCategory = categories.find((c) => c.id === item.category_id)!;
    const otherCategory = categories.find((c) => c.id !== item.category_id)!;
    const page = await seedSession(context, freshClient);
    await page.goto(paths.exercises);
    const search = page.getByRole('searchbox', { name: 'Поиск упражнения' });
    await search.fill(item.name);
    await expect(page.getByText('Найдено: 1')).toBeVisible();
    await page
      .getByRole('button', { name: `${ownCategory.name} (${ownCategory.exercise_count})` })
      .click();
    await expect(search).toHaveValue(item.name);
    await expect(page.getByRole('link', { name: new RegExp(item.name, 'i') })).toBeVisible();
    await page
      .getByRole('button', { name: `${otherCategory.name} (${otherCategory.exercise_count})` })
      .click();
    await expect(page.getByText('Найдено: 0')).toBeVisible();
    await expect(page.getByText('Ничего не найдено')).toBeVisible();
    await page.getByRole('button', { name: 'Все', exact: true }).click();
    await expect(search).toHaveValue(item.name);
    await expect(page.getByText('Найдено: 1')).toBeVisible();
  });

  test('EX-04 избранное одинаково в списке и карточке после reload @core', async ({
    context,
    freshClient,
    api,
  }) => {
    const list = await api.expectOk<ExercisePage>(
      'catalog',
      api.get('/api/v1/exercises', freshClient.tokens),
      200,
    );
    const item = list.items.find((i) => !i.is_favorite)!;
    const page = await seedSession(context, freshClient);
    try {
      await page.goto(paths.exercises);
      const row = page
        .getByRole('listitem')
        .filter({ has: page.getByRole('link', { name: new RegExp(item.name, 'i') }) })
        .last();
      const [added] = await Promise.all([
        page.waitForResponse(
          (r) =>
            r.request().method() === 'PUT' &&
            r.url().includes(`/api/v1/exercises/${item.id}/favorite`),
        ),
        row.getByRole('button', { name: 'В избранное' }).click(),
      ]);
      expect(added.status()).toBe(200);
      await expect(row.getByRole('button', { name: 'Убрать из избранного' })).toBeVisible();
      await row.getByRole('link', { name: new RegExp(item.name, 'i') }).click();
      await expect(page.getByRole('heading', { name: item.name })).toBeVisible();
      await page.reload();
      const toggle = page.getByRole('button', { name: 'Убрать из избранного' });
      await expect(toggle).toHaveAttribute('aria-pressed', 'true');
      const [removed] = await Promise.all([
        page.waitForResponse(
          (r) =>
            r.request().method() === 'PUT' &&
            r.url().includes(`/api/v1/exercises/${item.id}/favorite`),
        ),
        toggle.click(),
      ]);
      expect(removed.status()).toBe(200);
      await page.goto(paths.exercises);
      await expect(
        page
          .getByRole('listitem')
          .filter({ has: page.getByRole('link', { name: new RegExp(item.name, 'i') }) })
          .last()
          .getByRole('button', { name: 'В избранное' }),
      ).toBeVisible();
    } finally {
      // При падении сохраняем независимость соседних сценариев на этом аккаунте.
      await api.put(
        `/api/v1/exercises/${item.id}/favorite?is_favorite=false`,
        freshClient.tokens,
        {},
      );
    }
  });

  test('EX-05 упражнение каталога добавляется в программу один раз @core', async ({
    context,
    freshClient,
    programFixture,
    api,
  }) => {
    const list = await api.expectOk<ExercisePage>(
      'catalog',
      api.get('/api/v1/exercises', freshClient.tokens),
      200,
    );
    const item = list.items.find((i) => i.id !== programFixture.exerciseId)!;
    const page = await seedSession(context, freshClient);
    try {
      await page.goto(exercise(item.id));
      await expect(page.getByRole('heading', { name: item.name })).toBeVisible();
      await page.getByRole('button', { name: 'Добавить в тренировку' }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('button', { name: programFixture.name }).click();
      await dialog.getByRole('button', { name: 'Выбрать программу' }).click();
      await dialog.getByRole('button', { name: 'День 1' }).click();
      const [added] = await Promise.all([
        page.waitForResponse(
          (r) =>
            r.request().method() === 'POST' &&
            r.url().endsWith(`/api/v1/programs/${programFixture.programId}/exercises`),
        ),
        dialog.getByRole('button', { name: 'Выбрать день' }).click(),
      ]);
      expect([200, 201]).toContain(added.status());
      await expect(dialog.getByText('Добавлено!')).toBeVisible();
      await dialog.getByRole('button', { name: 'Готово' }).click();
      const detail = await api.expectOk<{
        days: { slots: { exercises: { name: string; sets: number; reps: number }[] }[] }[];
      }>(
        'program after add',
        api.get(`/api/v1/programs/${programFixture.programId}`, freshClient.tokens),
        200,
      );
      const matching = detail.days[0]!.slots.flatMap((s) => s.exercises).filter(
        (e) => e.name === item.name,
      );
      expect(matching).toHaveLength(1);
      expect(matching[0]).toMatchObject({ name: item.name, sets: 3, reps: 10 });
      await page.goto(program(programFixture.programId));
      await page.reload();
      await expect(page.getByText(item.name, { exact: true })).toHaveCount(1);
      await expect(page.getByText('3 подхода × 10 повторений').first()).toBeVisible();
    } finally {
      await api.delete(`/api/v1/programs/${programFixture.programId}`, freshClient.tokens);
    }
  });

  test('EX-06 своё упражнение доступно автору в конструкторе после нового входа @core', async ({
    context,
    freshTrainer,
    api,
    runId,
  }) => {
    test.setTimeout(60_000);
    const name = `Своё упражнение ${runId}`;
    const page = await seedSession(context, freshTrainer);
    let exerciseId: string | undefined;
    try {
      await page.goto(paths.programNew);
      await page.getByRole('button', { name: 'Добавить день' }).click();
      await page.getByRole('dialog').getByPlaceholder('Название дня').fill('День 1');
      await page.getByRole('dialog').getByRole('button', { name: 'Добавить', exact: true }).click();
      await page.getByRole('button', { name: 'Добавить упражнение' }).click();
      // Фокус открывает список последних упражнений поверх кнопки создания.
      // Уход фокуса закрывает список, после чего кнопка получает клик как пользователь.
      await page.getByRole('dialog').getByPlaceholder('Название упражнения').press('Tab');
      await expect(page.getByRole('dialog').getByRole('list')).toHaveCount(0);
      await page.getByRole('button', { name: '+ Создать своё упражнение' }).click();
      const dialog = page.getByRole('dialog').last();
      await dialog.getByLabel('Название', { exact: true }).fill(name);
      await dialog.getByLabel('Категория').selectOption({ index: 1 });
      await dialog.getByLabel('Сложность').selectOption({ label: 'Начальный' });
      await dialog.getByLabel('Описание').fill('Упражнение для проверки каталога');
      const [created] = await Promise.all([
        page.waitForResponse(
          (r) => r.request().method() === 'POST' && r.url().endsWith('/api/v1/exercises'),
        ),
        dialog.getByRole('button', { name: 'Сохранить' }).click(),
      ]);
      expect(created.status()).toBe(201);
      exerciseId = ((await created.json()) as { id: string }).id;

      // Новый набор токенов и отдельный browser context проверяют серверную запись.
      await api.expectOk(
        'request new login code',
        api.anonymous('/api/v1/auth/login/request-code', { contact: freshTrainer.user.email }),
        200,
      );
      const login = await api.expectOk<{ auth: Session | null }>(
        'new trainer login',
        api.anonymous('/api/v1/auth/login/verify-code', {
          contact: freshTrainer.user.email,
          code: DEV_VERIFICATION_CODE,
        }),
        200,
      );
      if (!login.auth) throw new Error('Code login did not produce a session');
      const anotherContext = await context.browser()!.newContext();
      try {
        const another = await seedSession(anotherContext, login.auth);
        await another.goto(paths.programNew);
        await another.getByRole('button', { name: 'Добавить день' }).click();
        await another.getByRole('dialog').getByPlaceholder('Название дня').fill('День 1');
        await another
          .getByRole('dialog')
          .getByRole('button', { name: 'Добавить', exact: true })
          .click();
        await another.getByRole('button', { name: 'Добавить упражнение' }).click();
        await another.getByRole('dialog').getByPlaceholder('Название упражнения').fill(name);
        await expect(
          another.getByRole('dialog').getByRole('button', { name, exact: true }),
        ).toBeVisible();
        await another.goto(exercise(exerciseId));
        await expect(another.getByRole('heading', { name })).toBeVisible();
        await expect(another.getByRole('button', { name: 'Редактировать' })).toBeVisible();
      } finally {
        await anotherContext.close();
      }
    } finally {
      if (exerciseId) await api.delete(`/api/v1/exercises/${exerciseId}`, freshTrainer.tokens);
    }
  });

  test('EX-07 чужое собственное упражнение недоступно в поиске и по адресу @core @security', async ({
    context,
    freshTrainer,
    freshClient,
    api,
    runId,
  }) => {
    const categories = await api.expectOk<Category[]>(
      'categories',
      api.get('/api/v1/exercises/categories', freshTrainer.tokens),
      200,
    );
    const name = `Чужое упражнение ${runId}`;
    const created = await api.expectOk<{ id: string }>(
      'prepare own exercise',
      api.post('/api/v1/exercises', freshTrainer.tokens, {
        name,
        category_id: categories[0]!.id,
        difficulty: 'beginner',
        description: '',
        steps: [],
        alt_names: [],
      }),
      201,
    );
    try {
      const page = await seedSession(context, freshClient);
      await page.goto(paths.exercises);
      await page.getByRole('searchbox', { name: 'Поиск упражнения' }).fill(name);
      await expect(page.getByText('Найдено: 0')).toBeVisible();
      await expect(page.getByText('Ничего не найдено')).toBeVisible();
      const [denied] = await Promise.all([
        page.waitForResponse(
          (r) =>
            r.request().method() === 'GET' && r.url().endsWith(`/api/v1/exercises/${created.id}`),
        ),
        page.goto(exercise(created.id)),
      ]);
      expect([403, 404]).toContain(denied.status());
      await expect(page.getByText('Не удалось загрузить упражнение')).toBeVisible();
      await expect(page.getByText(name, { exact: true })).toHaveCount(0);
    } finally {
      await api.delete(`/api/v1/exercises/${created.id}`, freshTrainer.tokens);
    }
  });

  test('EX-08 пустой поиск, сбой каталога и недоступное медиа объяснены @core', async ({
    context,
    freshClient,
    api,
    runId,
  }) => {
    const page = await seedSession(context, freshClient);
    await page.goto(paths.exercises);
    const search = page.getByRole('searchbox', { name: 'Поиск упражнения' });
    await search.fill(`несуществующее-${runId}`);
    await expect(page.getByText('Ничего не найдено')).toBeVisible();
    await search.fill('');
    await expect(page.getByText('Найдено: 0')).toHaveCount(0);

    await page.route('**/api/v1/exercises?*', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"code":"service_unavailable"}',
      }),
    );
    await search.fill(`ошибка-${runId}`);
    await expect(page.getByText('Не удалось загрузить упражнения')).toBeVisible();
    await page.unroute('**/api/v1/exercises?*');
    await page.getByRole('button', { name: 'Назад' }).click();
    await expect(page).toHaveURL(new RegExp(`${paths.programs}$`));

    const categories = await api.expectOk<Category[]>(
      'categories for exercise media',
      api.get('/api/v1/exercises/categories', freshClient.tokens),
      200,
    );
    const item = await api.expectOk<{ id: string; name: string }>(
      'exercise for media failure',
      api.post('/api/v1/exercises', freshClient.tokens, {
        name: `Медиа ${runId}`,
        category_id: categories[0]!.id,
        difficulty: 'beginner',
        description: '',
        steps: [],
        alt_names: [],
      }),
      201,
    );
    await uploadExerciseImage(freshClient, item.id);
    const detail = await api.expectOk<{ media: { url: string; kind: string }[] }>(
      'exercise media',
      api.get(`/api/v1/exercises/${item.id}`, freshClient.tokens),
      200,
    );
    const image = detail.media.find((m) => m.kind === 'image');
    if (!image) throw new Error('Prepared exercise image is missing');
    await page.route(image.url, (route) => route.fulfill({ status: 404, body: '' }));
    await page.goto(exercise(item.id));
    await expect(page.getByRole('heading', { name: item.name })).toBeVisible();
    await expect(page.getByText('Не удалось загрузить медиа')).toBeVisible();
    await page.getByRole('button', { name: 'Назад' }).click();
    await expect(page).toHaveURL(new RegExp(`${paths.exercises}$`));
  });
});

for (const theme of ['light', 'dark'] as const) {
  test(`EX-09 каталог подгружается при прокрутке и возвращает к позиции (${theme}) @core @narrow`, async ({
    context,
    freshClient,
    api,
  }) => {
    const prefix = 'Каталог E2E';
    const catalogue = await api.expectOk<ExercisePage>(
      'paged catalogue fixture',
      api.get(
        `/api/v1/exercises?search=${encodeURIComponent(prefix)}&limit=200`,
        freshClient.tokens,
      ),
      200,
    );
    expect(catalogue.total).toBe(100);
    const prepared = catalogue.items;
    const page = await seedSession(context, freshClient);
    await page.emulateMedia({ colorScheme: theme });
    const offsets: number[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname === '/api/v1/exercises' && url.searchParams.get('search') === prefix) {
        expect(url.searchParams.get('limit')).toBe('40');
        offsets.push(Number(url.searchParams.get('offset')));
      }
    });
    await page.goto(paths.exercises);
    await page.getByRole('searchbox', { name: 'Поиск упражнения' }).fill(prefix);
    await expect(page.getByText('Найдено: 100')).toBeVisible();
    await expect(page.getByRole('link', { name: new RegExp(prepared[0]!.name) })).toBeVisible();
    expect(offsets).toEqual([0]);
    const rows = page.getByRole('list', { name: 'Упражнения', exact: true }).getByRole('listitem');
    expect(await rows.count()).toBeLessThan(30);
    const main = page.getByRole('main');
    await main.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    const last = page.getByRole('link', { name: new RegExp(prepared[99]!.name) });
    await expect(last).toBeVisible();
    expect(offsets).toContain(80);
    expect(await rows.count()).toBeLessThan(30);
    const before = await last.boundingBox();
    await last.click();
    await expect(page.getByRole('heading', { name: prepared[99]!.name })).toBeVisible();
    await page.getByRole('button', { name: 'Назад' }).click();
    await expect(last).toBeVisible();
    const after = await last.boundingBox();
    expect(Math.abs(after!.y - before!.y)).toBeLessThanOrEqual(80);
    await main.evaluate((element) => {
      element.scrollTop = 0;
    });
    await page.reload();
    await page.getByRole('searchbox', { name: 'Поиск упражнения' }).fill(prefix);
    await expect(page.getByText('Найдено: 100')).toBeVisible();
    await expect(page.getByRole('link', { name: new RegExp(prepared[0]!.name) })).toBeVisible();
  });
}

test('EX-10 конструктор и аналитика выбирают упражнение за первой страницей @core', async ({
  context,
  freshClient,
  api,
}) => {
  const prefix = 'Каталог E2E';
  const catalogue = await api.expectOk<ExercisePage>(
    'paged catalogue fixture',
    api.get(`/api/v1/exercises?search=${encodeURIComponent(prefix)}&limit=200`, freshClient.tokens),
    200,
  );
  const last = catalogue.items.at(-1)!;
  const page = await seedSession(context, freshClient);
  await page.goto(paths.programNew);
  await page.getByRole('button', { name: 'Добавить день' }).click();
  await page.getByRole('dialog').getByPlaceholder('Название дня').fill('День 1');
  await page.getByRole('dialog').getByRole('button', { name: 'Добавить', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить упражнение' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByPlaceholder('Название упражнения').fill(prefix);
  const results = dialog.getByRole('region', { name: 'Результаты поиска упражнений' });
  await expect(
    results.getByRole('button', { name: catalogue.items[0]!.name, exact: true }),
  ).toBeVisible();
  await results.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await results.getByRole('button', { name: last.name, exact: true }).click();
  await expect(dialog.getByPlaceholder('Название упражнения')).toHaveValue(last.name);
  await dialog.getByPlaceholder('Подходы').fill('3');
  await dialog.getByPlaceholder('Повторения').fill('10');
  await dialog.getByRole('button', { name: 'Добавить', exact: true }).click();
  await expect(page.getByText(last.name, { exact: true })).toBeVisible();
  await page.goto(`${paths.analytics}?view=exercise`);
  await page.getByRole('button', { name: 'Выберите упражнение', exact: true }).click();
  const picker = page.getByRole('dialog');
  await picker.getByLabel('Поиск упражнения', { exact: true }).fill(prefix);
  const list = picker.getByRole('region', { name: 'Список упражнений' });
  await expect(
    list.getByRole('button', { name: catalogue.items[0]!.name, exact: true }),
  ).toBeVisible();
  await list.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await list.getByRole('button', { name: last.name, exact: true }).click();
  await expect(page.getByRole('button', { name: 'Выберите упражнение', exact: true })).toHaveText(
    last.name,
  );
  await expect(page).toHaveURL(new RegExp(`exercise=${last.id}`));
  await page.reload();
  await expect(page.getByRole('button', { name: 'Выберите упражнение', exact: true })).toHaveText(
    last.name,
  );
});
