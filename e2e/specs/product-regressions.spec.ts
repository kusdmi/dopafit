import type { BrowserContext, Page } from '@playwright/test';
import type { components } from '../../frontend/src/shared/api/schema.d.ts';
import { seedSession } from '../fixtures/accounts.ts';
import { activateSubscription } from '../fixtures/commerce.ts';
import { createProgram, linkClient } from '../fixtures/data.ts';
import { expect, test } from '../fixtures/test.ts';
import { connectionMeasurements, paths, programStart } from '../support/paths.ts';

function day(offset: number) {
  return new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
}
async function fill(page: Page, date: string, weight: string) {
  await page.getByLabel('Дата', { exact: true }).fill(date);
  await page.getByLabel('Вес', { exact: true }).fill(weight);
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Сохранить', exact: true })).toBeEnabled();
}
async function disconnect(context: BrowserContext, page: Page) {
  await context.setOffline(true);
  await expect(page.getByRole('button', { name: 'Офлайн-режим' })).toBeVisible();
}

for (const pwa of [false, true]) {
  test(`BUG-01 две офлайн-записи, правка ожидающей, reload и третья онлайн без дублей @core${pwa ? ' @pwa' : ''}`, async ({
    context,
    freshClient,
    api,
  }) => {
    const page = await seedSession(context, freshClient);
    await page.goto(paths.measurements);
    await expect(page.getByLabel('Вес', { exact: true })).toBeVisible();
    if (pwa)
      await expect
        .poll(() => page.evaluate(() => !!navigator.serviceWorker?.controller))
        .toBe(true);
    await disconnect(context, page);
    await fill(page, day(-6), '71.1');
    await expect(page.getByText('Замер сохранён на устройстве')).toBeVisible();
    await fill(page, day(-5), '72.2');
    await expect(page.getByText('Ожидает синхронизации')).toHaveCount(2);
    await page.getByLabel('Дата', { exact: true }).fill(day(-6));
    await expect(page.getByLabel('Вес', { exact: true })).toHaveValue('71.1');
    await page.getByLabel('Вес', { exact: true }).fill('73.3');
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Подтвердить' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    if (pwa) {
      await page.reload();
      await page.getByLabel('Дата', { exact: true }).fill(day(-6));
      await expect(page.getByLabel('Вес', { exact: true })).toHaveValue('73.3');
    }
    await context.setOffline(false);
    await expect(page.getByRole('button', { name: 'Офлайн-режим' })).toHaveCount(0);
    await expect
      .poll(async () => {
        const result = await api.expectOk<components['schemas']['MeasurementPage']>(
          'synced measurements',
          api.get('/api/v1/measurements', freshClient.tokens),
          200,
        );
        return result.items
          .filter((m) => [day(-6), day(-5)].includes(m.date))
          .map((m) => ({ date: m.date, weight: m.weight }))
          .sort((a, b) => a.date.localeCompare(b.date));
      })
      .toEqual([
        { date: day(-6), weight: 73.3 },
        { date: day(-5), weight: 72.2 },
      ]);
    await page.reload();
    await fill(page, day(-4), '74.4');
    await expect
      .poll(async () => {
        const result = await api.expectOk<components['schemas']['MeasurementPage']>(
          'three measurements',
          api.get('/api/v1/measurements', freshClient.tokens),
          200,
        );
        return result.items
          .filter((m) => [day(-6), day(-5), day(-4)].includes(m.date))
          .map((m) => m.weight)
          .sort();
      })
      .toEqual([73.3, 72.2, 74.4].sort());
  });
}

test('BUG-02 heartbeat восстанавливает баннер и очередь при navigator online @core', async ({
  context,
  freshClient,
  api,
}) => {
  const page = await seedSession(context, freshClient);
  await page.goto(paths.measurements);
  await page.getByLabel('Дата', { exact: true }).fill(day(-7));
  let unavailable = true;
  await page.route('**/api/v1/**', (route) =>
    unavailable ? route.abort('failed') : route.continue(),
  );
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('button', { name: 'Офлайн-режим' })).toBeVisible();
  expect(await page.evaluate(() => navigator.onLine)).toBe(true);
  await page.getByLabel('Вес', { exact: true }).fill('69.9');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByText('Ожидает синхронизации')).toBeVisible();
  unavailable = false;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('button', { name: 'Офлайн-режим' })).toHaveCount(0);
  await expect
    .poll(
      async () =>
        (
          await api.expectOk<components['schemas']['MeasurementPage']>(
            'heartbeat sync',
            api.get('/api/v1/measurements', freshClient.tokens),
            200,
          )
        ).items.find((m) => m.date === day(-7))?.weight,
    )
    .toBe(69.9);
});

test('BUG-03 тренер читает числовые замеры до связи и теряет доступ на открытой странице @core @security', async ({
  context,
  freshTrainer,
  freshClient,
  api,
}) => {
  await api.expectOk(
    'old measurement',
    api.post('/api/v1/measurements', freshClient.tokens, {
      date: day(-200),
      neck: 42,
      custom_values: [],
    }),
    201,
  );
  for (let i = 1; i <= 105; i++)
    await api.expectOk(
      'measurement page',
      api.post('/api/v1/measurements', freshClient.tokens, {
        date: day(-i),
        neck: 10,
        custom_values: [],
      }),
      201,
    );
  const link = await linkClient(api, freshTrainer, freshClient);
  const page = await seedSession(context, freshTrainer);
  await page.goto(connectionMeasurements(link.cardId));
  const oldest = page.getByRole('button', { name: /Замер за/ }).last();
  await expect(oldest).toBeVisible();
  await oldest.click();
  await expect(page.getByText('42', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Сохранить', exact: true })).toHaveCount(0);
  await expect(page.getByText('Фотографии', { exact: true })).toHaveCount(0);
  await api.expectOk(
    'unlink',
    api.post(`/api/v1/clients/${link.cardId}/unlink`, freshClient.tokens),
    200,
  );
  await expect(page.getByText('Не удалось загрузить замеры клиента')).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByText('42', { exact: true })).toHaveCount(0);
  expect(
    (await api.get(`/api/v1/measurements?client_id=${link.cardId}`, freshTrainer.tokens)).status(),
  ).toBe(404);
});

test('BUG-04 окончание Premium требует разовый выбор и сохраняет остальные программы @core', async ({
  context,
  freshClient,
  api,
  runId,
}) => {
  await activateSubscription(api, freshClient);
  const first = await createProgram(api, freshClient, runId, { name: 'Первая программа' });
  const second = await createProgram(api, freshClient, runId, { name: 'Вторая программа' });
  await api.expectOk(
    'expire soon',
    api.post('/api/v1/subscriptions/test-expiry', freshClient.tokens, { seconds: 4 }),
    200,
  );
  const page = await seedSession(context, freshClient);
  await page.goto(paths.settingsSubscription);
  await expect(page.getByText('Ваша подписка активна')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Выберите ресурсы бесплатного тарифа' }),
  ).toBeVisible({ timeout: 12000 });
  await page.getByRole('checkbox', { name: first.name, exact: true }).check();
  await page.getByRole('button', { name: 'Подтвердить выбор' }).click();
  await expect(
    page.getByRole('heading', { name: 'Выберите ресурсы бесплатного тарифа' }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Выберите ресурсы бесплатного тарифа' }),
  ).toHaveCount(0);
  const status = await api.expectOk<components['schemas']['SubscriptionStatusOut']>(
    'free selection',
    api.get('/api/v1/subscriptions/status', freshClient.tokens),
    200,
  );
  expect(status.entitlements?.selection.program_ids).toEqual([first.programId]);
  expect((await api.get(`/api/v1/programs/${second.programId}`, freshClient.tokens)).status()).toBe(
    200,
  );
  expect(
    (
      await api.post('/api/v1/subscriptions/free-selection', freshClient.tokens, {
        cycle: status.entitlements!.selection.cycle,
        program_ids: [second.programId],
        client_ids: [],
      })
    ).status(),
  ).toBe(409);
});

test('BUG-05 только параметры с историей, ноль и пустой период сохраняют выбор; фото имеют два места @core', async ({
  context,
  freshClient,
  api,
}) => {
  await api.expectOk(
    'zero measurement',
    api.post('/api/v1/measurements', freshClient.tokens, {
      date: day(-100),
      neck: 0,
      custom_values: [],
    }),
    201,
  );
  const page = await seedSession(context, freshClient);
  await page.goto(paths.analytics);
  await page.getByRole('tab', { name: 'Антропометрия', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Шея', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Талия', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Шея', exact: true }).click();
  await page.getByRole('button', { name: 'Вес', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Шея', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(
    page.getByText('За выбранный период нет записей. Выберите другой период.'),
  ).toBeVisible();
  await expect(page.getByLabel('Места для фотографий')).toContainText('Было: выберите фотографию');
  await expect(page.getByLabel('Места для фотографий')).toContainText('Стало: выберите фотографию');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Шея', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('BUG-06 личные данные сохраняются до подтверждения телефона; подтверждённый контакт заменяется кодом @core', async ({
  context,
  freshClient,
  api,
  runId,
}) => {
  const page = await seedSession(context, freshClient);
  await page.goto(paths.settingsProfile);
  const phone = `+7999${Date.now().toString().slice(-7)}`;
  const nextPhone = `+7888${Date.now().toString().slice(-7)}`;
  await page.getByRole('textbox', { name: 'Имя', exact: true }).fill('Анна');
  await page.getByRole('textbox', { name: 'Фамилия', exact: true }).fill(`Тест ${runId}`);
  await page.getByRole('textbox', { name: 'Отчество', exact: true }).fill('Ивановна');
  await page.getByRole('textbox', { name: 'Телефон', exact: true }).fill(phone);
  await page.getByRole('button', { name: 'Сохранить телефон' }).click();
  await expect(page.getByText(phone, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Сохранить профиль' }).click();
  await expect(page.getByText('Профиль сохранён')).toBeVisible();
  const before = await api.expectOk<components['schemas']['MeOut']>(
    'unverified profile',
    api.get('/api/v1/users/me', freshClient.tokens),
    200,
  );
  expect(before.profile).toMatchObject({
    first_name: 'Анна',
    last_name: `Тест ${runId}`,
    middle_name: 'Ивановна',
  });
  expect(before.user.phone_verified).toBe(false);
  await page.getByRole('button', { name: 'Подтвердить телефон' }).click();
  await page.getByRole('dialog').getByRole('textbox', { name: 'Код подтверждения' }).fill('000000');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Телефон', exact: true }).fill(nextPhone);
  await page.getByRole('button', { name: 'Сохранить телефон' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(
    (
      await api.expectOk<components['schemas']['MeOut']>(
        'old phone before code',
        api.get('/api/v1/users/me', freshClient.tokens),
        200,
      )
    ).user.phone,
  ).toBe(phone);
  await page.getByRole('dialog').getByRole('textbox', { name: 'Код подтверждения' }).fill('000000');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Имя', exact: true })).toHaveValue('Анна');
  expect(
    (
      await api.expectOk<components['schemas']['MeOut']>(
        'confirmed phone',
        api.get('/api/v1/users/me', freshClient.tokens),
        200,
      )
    ).user,
  ).toMatchObject({ phone: nextPhone, phone_verified: true });
});

test('BUG-07 тренер подключает Premium себе без подарка @core', async ({
  context,
  freshTrainer,
  api,
}) => {
  const page = await seedSession(context, freshTrainer);
  await page.goto(paths.settingsSubscription);
  await expect(page.getByRole('button', { name: /Подарить/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Подключить Premium бесплатно' }).click();
  await expect(page.getByText('Premium подключён')).toBeVisible();
  const status = await api.expectOk<components['schemas']['SubscriptionStatusOut']>(
    'trainer active',
    api.get('/api/v1/subscriptions/status', freshTrainer.tokens),
    200,
  );
  expect(status.entitlements?.limits.clients).toBe(100);
  await page.reload();
  await expect(page.getByText('Premium подключён')).toBeVisible();
});

test('BUG-08 истечение Premium офлайн отключает отдых, но начатая тренировка завершается и синхронизируется @core @pwa', async ({
  context,
  freshClient,
  api,
  runId,
}) => {
  await activateSubscription(api, freshClient);
  const fixture = await createProgram(api, freshClient, runId);
  await api.expectOk(
    'expire after starting',
    api.post('/api/v1/subscriptions/test-expiry', freshClient.tokens, { seconds: 8 }),
    200,
  );
  const page = await seedSession(context, freshClient);
  await page.goto(programStart(fixture.programId));
  await page.getByRole('button', { name: 'День 1', exact: true }).click();
  await page.getByRole('button', { name: 'Старт', exact: true }).click();
  await page.getByLabel('КГ', { exact: true }).fill('40');
  await page.getByRole('spinbutton', { name: 'Повторы' }).fill('10');
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Как работает таймер отдыха' })).toBeVisible();
  await disconnect(context, page);
  await expect(page.getByText('Premium', { exact: true })).toBeVisible({ timeout: 12000 });
  await expect(page.getByRole('button', { name: 'Как работает таймер отдыха' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('Premium', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Завершить тренировку' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Завершить', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Итоги тренировки/ })).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByRole('button', { name: 'Офлайн-режим' })).toHaveCount(0);
  await expect
    .poll(async () =>
      (
        await api.get(
          `/api/v1/workouts/history/by-variant/${fixture.variantId}`,
          freshClient.tokens,
        )
      ).json(),
    )
    .toMatchObject({ days: [expect.objectContaining({ entries: [expect.anything()] })] });
});

test('BUG-09 выбор клиентов блокирует превышенную группу, сохраняя собственную программу @core', async ({
  context,
  freshTrainer,
  api,
  runId,
}) => {
  await activateSubscription(api, freshTrainer);
  const own = await createProgram(api, freshTrainer, runId);
  const clients: { id: string; name: string }[] = [];
  for (let i = 0; i < 11; i++) {
    const name = `Клиент ${i} ${runId}`;
    const card = await api.expectOk<{ id: string }>(
      'create client',
      api.post('/api/v1/clients', freshTrainer.tokens, { display_name: name }),
      201,
    );
    clients.push({ id: card.id, name });
  }
  await api.expectOk(
    'expire trainer',
    api.post('/api/v1/subscriptions/test-expiry', freshTrainer.tokens, { seconds: -1 }),
    200,
  );
  const page = await seedSession(context, freshTrainer);
  await page.goto(paths.settingsSubscription);
  await expect(
    page.getByRole('heading', { name: 'Выберите ресурсы бесплатного тарифа' }),
  ).toBeVisible();
  expect(
    (
      await api.put(`/api/v1/clients/${clients[0].id}`, freshTrainer.tokens, {
        display_name: clients[0].name,
      })
    ).status(),
  ).toBe(403);
  await page.goto(programStart(own.programId));
  await page.getByRole('button', { name: 'День 1', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Старт', exact: true })).toBeEnabled();
  await page.goto(paths.settingsSubscription);
  for (const client of clients.slice(0, 10))
    await page.getByRole('checkbox', { name: client.name, exact: true }).check();
  await page.getByRole('checkbox', { name: own.name, exact: true }).check();
  await page.getByRole('button', { name: 'Подтвердить выбор' }).click();
  await expect(
    page.getByRole('heading', { name: 'Выберите ресурсы бесплатного тарифа' }),
  ).toHaveCount(0);
  expect(
    (
      await api.put(`/api/v1/clients/${clients[0].id}`, freshTrainer.tokens, {
        display_name: clients[0].name,
      })
    ).status(),
  ).toBe(200);
  expect((await api.get(`/api/v1/clients/${clients[10].id}`, freshTrainer.tokens)).status()).toBe(
    200,
  );
  expect(
    (
      await api.put(`/api/v1/clients/${clients[10].id}`, freshTrainer.tokens, {
        display_name: clients[10].name,
      })
    ).status(),
  ).toBe(403);
});
