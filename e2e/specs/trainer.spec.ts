import { registerClient, seedSession } from '../fixtures/accounts.ts';
import type { Api } from '../fixtures/api.ts';
import type { Session } from '../fixtures/accounts.ts';
import { createProgram, linkClient } from '../fixtures/data.ts';
import { expect, test } from '../fixtures/test.ts';
import { ProgramEditor } from '../pages/program-editor.ts';
import { connectionEdit, paths, program, programShare } from '../support/paths.ts';

/** Section G of docs/e2e-spec.md. Every unrelated prerequisite is prepared via API. */
interface ClientCard {
  id: string;
  display_name: string;
  status: string;
}

interface ClientList {
  items: ClientCard[];
  stats: { total: number; active: number };
}

async function managedClient(api: Api, trainer: Session, name: string): Promise<ClientCard> {
  return api.expectOk<ClientCard>(
    'prepare managed client',
    api.post('/api/v1/clients', trainer.tokens, { display_name: name }),
    201,
  );
}

async function card(api: Api, trainer: Session, id: string): Promise<ClientCard> {
  return api.expectOk<ClientCard>(
    'read client card',
    api.get(`/api/v1/clients/${id}`, trainer.tokens),
    200,
  );
}

test.describe('G. Действия тренера', () => {
  test('TRAIN-01 тренер создаёт клиента без аккаунта, запись сохраняется после нового входа @smoke', async ({
    browser,
    context,
    trainerSession,
    runId,
  }) => {
    const name = `Подопечный ${runId}`;
    const page = await seedSession(context, trainerSession);
    await page.goto(paths.connectionAdd);
    await page.getByRole('textbox', { name: 'Имя клиента' }).fill(name);
    const [created] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().endsWith('/api/v1/clients') && r.request().method() === 'POST',
      ),
      page.getByRole('button', { name: 'Создать профиль' }).click(),
    ]);
    expect(created.status()).toBe(201);
    await expect(page.getByRole('button', { name: new RegExp(name) })).toHaveCount(1);

    // Новый контекст не наследует кэш первого входа: карточка должна прийти с сервера.
    const nextContext = await browser.newContext({
      baseURL: process.env.E2E_BASE_URL ?? 'http://frontend-e2e:5173',
    });
    try {
      const nextPage = await seedSession(nextContext, trainerSession);
      await nextPage.goto(paths.connections);
      await expect(nextPage.getByRole('button', { name: new RegExp(name) })).toHaveCount(1);
    } finally {
      await nextContext.close();
    }
  });

  test('TRAIN-02 правка своего клиента не меняет другого', async ({
    context,
    api,
    freshTrainer,
    runId,
  }) => {
    const first = await managedClient(api, freshTrainer, `Первый ${runId}`);
    const second = await managedClient(api, freshTrainer, `Второй ${runId}`);
    const page = await seedSession(context, freshTrainer);
    await page.goto(connectionEdit(first.id));
    await page.getByRole('textbox', { name: 'Имя клиента' }).fill(`Новый ${runId}`);
    await page.getByRole('textbox', { name: 'Примечание тренера' }).fill('Только первый');
    const [updated] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().endsWith(`/api/v1/clients/${first.id}`) && r.request().method() === 'PUT',
      ),
      page.getByRole('button', { name: 'Сохранить изменения' }).click(),
    ]);
    expect(updated.status()).toBe(200);
    await page.goto(paths.connections);
    await page.reload();
    await expect(page.getByRole('button', { name: new RegExp(`Новый ${runId}`) })).toHaveCount(1);
    await expect(page.getByRole('button', { name: new RegExp(`Второй ${runId}`) })).toHaveCount(1);
    expect((await card(api, freshTrainer, second.id)).display_name).toBe(`Второй ${runId}`);
  });

  test('TRAIN-03 архивация и восстановление своего клиента меняют статус и счётчик', async ({
    context,
    api,
    freshTrainer,
    runId,
  }) => {
    const client = await managedClient(api, freshTrainer, `Архив ${runId}`);
    const before = await api.expectOk<ClientList>(
      'clients before archive',
      api.get('/api/v1/clients', freshTrainer.tokens),
      200,
    );
    expect(before.stats).toMatchObject({ total: 1, active: 1 });
    const page = await seedSession(context, freshTrainer);
    await page.goto(connectionEdit(client.id));
    const [archiveResponse] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' &&
          r.url().endsWith(`/api/v1/clients/${client.id}/archive`),
      ),
      page.getByRole('button', { name: 'Архивировать' }).click(),
    ]);
    expect(archiveResponse.status()).toBe(200);
    await expect(page).toHaveURL(new RegExp(`${paths.connections}$`));
    await page.reload();
    await expect(page.getByRole('button', { name: new RegExp(client.display_name) })).toContainText(
      'Неактивный',
    );
    expect((await card(api, freshTrainer, client.id)).status).toBe('archived');
    const archived = await api.expectOk<ClientList>(
      'clients after archive',
      api.get('/api/v1/clients', freshTrainer.tokens),
      200,
    );
    expect(archived.stats).toMatchObject({ total: 1, active: 0 });
    await page.getByRole('button', { name: new RegExp(client.display_name) }).click();
    const [unarchived] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' &&
          r.url().endsWith(`/api/v1/clients/${client.id}/unarchive`),
      ),
      page.getByRole('button', { name: 'Разархивировать' }).click(),
    ]);
    expect(unarchived.status()).toBe(200);
    await expect(page).toHaveURL(new RegExp(`${paths.connections}$`));
    await page.reload();
    await expect(page.getByRole('button', { name: new RegExp(client.display_name) })).toContainText(
      'Мой',
    );
    expect((await card(api, freshTrainer, client.id)).status).toBe('active');
    const restored = await api.expectOk<ClientList>(
      'clients after restore',
      api.get('/api/v1/clients', freshTrainer.tokens),
      200,
    );
    expect(restored.stats).toMatchObject({ total: 1, active: 1 });
  });

  test('TRAIN-04 архивирование связанного клиента сохраняет правила доступа', async ({
    context,
    api,
    linkedPair,
  }) => {
    const { trainer, client, link } = linkedPair;
    const page = await seedSession(context, trainer);
    await page.goto(connectionEdit(link.cardId));
    await expect(
      page.getByText('Это аккаунт-клиент. Личные данные редактирует сам клиент.'),
    ).toBeVisible();
    const [archived] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' &&
          r.url().endsWith(`/api/v1/clients/${link.cardId}/archive`),
      ),
      page.getByRole('button', { name: 'Архивировать' }).click(),
    ]);
    expect(archived.status()).toBe(200);
    expect((await card(api, trainer, link.cardId)).status).toBe('archived');
    const other = await api.get(`/api/v1/clients/${link.cardId}`, client.tokens);
    expect(other.status()).toBe(403);
    await page.goto(connectionEdit(link.cardId));
    const [unarchived] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' &&
          r.url().endsWith(`/api/v1/clients/${link.cardId}/unarchive`),
      ),
      page.getByRole('button', { name: 'Разархивировать' }).click(),
    ]);
    expect(unarchived.status()).toBe(200);
    expect((await card(api, trainer, link.cardId)).status).toBe('active');
  });

  test('TRAIN-05 тренер создаёт программу с двумя днями, альтернативой и своим упражнением @smoke', async ({
    context,
    freshTrainer,
    runId,
  }) => {
    const page = await seedSession(context, freshTrainer);
    const editor = new ProgramEditor(page);
    const name = `Тренерская ${runId}`;
    const custom = `Свой подъём ${runId}`;
    await editor.openNew();
    await editor.setName(name);
    await editor.addDay('Силовой день');
    await editor.addExercise(0, 'Жим штанги лёжа', 4, 8);
    await editor.addExercise(0, 'Выпады', 3, 12, 'Жим штанги лёжа');
    await editor.addDay('Второй день');
    await page.getByRole('button', { name: 'Добавить упражнение' }).nth(1).click();
    const dialog = page.getByRole('dialog');
    // Собственное имя проверяется в конструкторе, поэтому здесь его вводят через UI.
    await dialog.getByPlaceholder('Название упражнения').fill(custom);
    await dialog.getByPlaceholder('Подходы').fill('3');
    await dialog.getByPlaceholder('Повторения').fill('10');
    await dialog.getByRole('button', { name: 'Добавить', exact: true }).click();
    expect(await editor.save('POST')).toBe(201);
    await page.goto(paths.programs);
    await page.getByRole('tab', { name: 'Мои программы' }).click();
    await page.getByRole('link').filter({ hasText: name }).click();
    await page.reload();
    await expect(page.getByRole('heading', { name })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Силовой день' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Второй день' })).toBeVisible();
    await expect(page.getByText('Выпады')).toBeVisible();
    await expect(page.getByText(custom)).toBeVisible();
  });

  test('TRAIN-06 тренер передаёт программу одному клиенту, другой её не получает', async ({
    context,
    browser,
    api,
    linkedPair,
    runId,
  }) => {
    const { trainer, client } = linkedPair;
    const otherClient = await registerClient(`${runId}-other`);
    await linkClient(api, trainer, otherClient);
    const source = await createProgram(api, trainer, runId);
    const page = await seedSession(context, trainer);
    await page.goto(program(source.programId));
    await page.getByRole('button', { name: 'Поделиться программой с клиентом' }).click();
    await expect(page).toHaveURL(new RegExp(`${programShare(source.programId)}$`));
    await page.getByRole('radio', { name: `Клиент ${runId}`, exact: true }).click();
    await expect(page.getByRole('radio', { name: `Клиент ${runId}`, exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    const [shared] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().endsWith(`/api/v1/programs/${source.programId}/share`) &&
          r.request().method() === 'POST',
      ),
      page.getByRole('button', { name: 'Скопировать', exact: true }).click(),
    ]);
    expect(shared.status()).toBe(200);
    const clientContext = await browser.newContext({
      baseURL: process.env.E2E_BASE_URL ?? 'http://frontend-e2e:5173',
    });
    try {
      const clientPage = await seedSession(clientContext, client);
      await clientPage.goto(paths.programs);
      await clientPage.getByRole('tab', { name: 'Мои программы' }).click();
      await expect(clientPage.getByRole('link').filter({ hasText: source.name })).toHaveCount(1);
      await clientPage.reload();
      await clientPage.getByRole('tab', { name: 'Мои программы' }).click();
      await expect(clientPage.getByRole('link').filter({ hasText: source.name })).toHaveCount(1);
    } finally {
      await clientContext.close();
    }
    const otherPrograms = await api.expectOk<{ name: string }[]>(
      'other client programs',
      api.get('/api/v1/programs', otherClient.tokens),
      200,
    );
    expect(otherPrograms.filter((entry) => entry.name === source.name)).toHaveLength(0);
  });
});

test('TRAIN-11 замеры тренера только личные, клиент выбирается в аналитике @core', async ({
  context,
  linkedPair,
}) => {
  const page = await seedSession(context, linkedPair.trainer);
  await page.goto(paths.measurements);
  await expect(page.getByLabel('Вес', { exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Клиенты', exact: true })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Выберите клиента' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Сохранить', exact: true })).toBeVisible();
  await page.goto(paths.analytics);
  await page
    .getByRole('tablist', { name: 'Просмотр данных' })
    .getByRole('tab', { name: 'Клиенты' })
    .click();
  await expect(page.getByRole('combobox', { name: 'Выберите клиента' })).toHaveValue(
    linkedPair.link.cardId,
  );
});
