import { seedSession } from '../fixtures/accounts.ts';
import { expect, test } from '../fixtures/test.ts';
import { paths } from '../support/paths.ts';

/**
 * Раздел B из docs/e2e-spec.md. Для каждой вкладки сверяем маршрут и заголовок:
 * адрес может смениться, пока содержимое предыдущего экрана остаётся на месте.
 */
const tabs = [
  { label: 'Главная', path: paths.home, heading: 'Календарь' },
  { label: 'Замеры', path: paths.measurements, heading: 'Данные антропометрии' },
  { label: 'Тренировка', path: paths.programs, heading: 'Программы тренировок' },
  { label: 'Аналитика', path: paths.analytics, heading: 'Аналитика прогресса' },
  { label: 'Настройки', path: paths.settings, heading: 'Настройки' },
] as const;

test.describe('B. Навигация', () => {
  test('NAV-01 основные вкладки клиента открывают правильные экраны @smoke', async ({
    context,
    clientSession,
  }) => {
    const page = await seedSession(context, clientSession);
    const nav = page.getByRole('navigation', { name: 'Основная навигация' });
    await expect(nav).toBeVisible();

    for (const tab of tabs) {
      await nav.getByRole('link', { name: tab.label }).click();
      await expect(page).toHaveURL(new RegExp(`${tab.path}$`));
      await expect(page.getByRole('heading', { name: tab.heading })).toBeVisible();
    }

    // «Назад» согласован с историей вкладок: шаг назад возвращает на аналитику,
    // предшествующую настройкам, а не на главную.
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`${paths.analytics}$`));
    await expect(page.getByRole('heading', { name: 'Аналитика прогресса' })).toBeVisible();
  });

  test('NAV-02 вкладки тренера открывают его список клиентов @core', async ({
    context,
    trainerSession,
    clientSession,
  }) => {
    const page = await seedSession(context, trainerSession);
    const nav = page.getByRole('navigation', { name: 'Основная навигация' });
    for (const tab of tabs) {
      await nav.getByRole('link', { name: tab.label }).click();
      await expect(page).toHaveURL(new RegExp(`${tab.path}$`));
      await expect(page.getByRole('heading', { name: tab.heading })).toBeVisible();
    }
    await page.goto(paths.connections);
    await expect(page.getByRole('heading', { name: 'Мои клиенты', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Добавить клиента' })).toBeVisible();

    // Роль берётся из сессии, а не из адреса: тот же URL клиенту даёт его экран.
    const clientContext = await context.browser()!.newContext();
    try {
      const clientPage = await seedSession(clientContext, clientSession);
      await clientPage.goto(paths.connections);
      await expect(clientPage.getByRole('heading', { name: 'Мой тренер' })).toBeVisible();
      await expect(clientPage.getByRole('button', { name: 'Добавить клиента' })).toHaveCount(0);
    } finally {
      await clientContext.close();
    }
  });

  test('NAV-03 глубокий адрес и история браузера сохраняют экран и сессию @core', async ({
    context,
    clientSession,
  }) => {
    const page = await seedSession(context, clientSession);
    await page.goto(paths.homeCalendar);
    await expect(page.getByRole('heading', { name: 'Календарь тренировок' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Календарь тренировок' })).toBeVisible();

    const another = await context.newPage();
    await another.goto(paths.homeCalendar);
    await expect(another.getByRole('heading', { name: 'Календарь тренировок' })).toBeVisible();
    await another.goto(paths.settings);
    await expect(another.getByRole('heading', { name: 'Настройки' })).toBeVisible();
    await another.goBack();
    await expect(another).toHaveURL(new RegExp(`${paths.homeCalendar}$`));
    await another.goForward();
    await expect(another).toHaveURL(new RegExp(`${paths.settings}$`));
  });

  test('NAV-04 календарь возвращается к сегодняшнему месяцу с событием @core', async ({
    context,
    freshClient,
    api,
  }) => {
    const page = await seedSession(context, freshClient);
    await page.clock.setFixedTime(new Date());
    const { today, day, iso, month } = await page.evaluate(() => {
      const now = new Date();
      const date = new Date(now.getFullYear(), now.getMonth() + 1, 15);
      return {
        today: now.getDate(),
        day: date.getDate(),
        iso: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
        month: `${new Intl.DateTimeFormat('ru-RU', { month: 'long' }).format(date)} ${date.getFullYear()}`,
      };
    });
    await api.expectOk(
      'prepare calendar event',
      api.post('/api/v1/calendar/events', freshClient.tokens, { date: iso, time: '18:30' }),
      201,
    );
    await page.goto(paths.homeCalendar);
    await page.getByRole('button', { name: 'Следующий месяц' }).click();
    await expect(page.getByText(new RegExp(`^${month}$`, 'i'))).toBeVisible();
    await page.getByRole('button', { name: 'Предыдущий месяц' }).click();
    await expect(page.getByText(new RegExp(`^${month}$`, 'i'))).toHaveCount(0);
    await page.getByRole('button', { name: String(today), exact: true }).click();
    await expect(
      page.getByRole('dialog').getByRole('heading', { name: 'Запись на тренировку' }),
    ).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Закрыть' }).click();
    await page.getByRole('button', { name: 'Следующий месяц' }).click();
    await expect(page.getByText(new RegExp(`^${month}$`, 'i'))).toBeVisible();
    await page.getByRole('button', { name: 'Следующий месяц' }).click();
    await page.getByRole('button', { name: 'Предыдущий месяц' }).click();
    await page.getByRole('button', { name: String(day), exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('18:30');
    await page.reload();
    await page.getByRole('button', { name: 'Следующий месяц' }).click();
    await page.getByRole('button', { name: String(day), exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('18:30');
  });

  test('NAV-05 календарь тренера показывает клиента после переноса и отмены @core', async ({
    context,
    linkedPair,
    api,
    runId,
  }) => {
    const { trainer, link } = linkedPair;
    const date = new Date();
    date.setMonth(date.getMonth() + 1, 15);
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const event = await api.expectOk<{ id: string }>(
      'prepare trainer event',
      api.post('/api/v1/calendar/events', trainer.tokens, {
        date: iso,
        time: '18:30',
        client_ids: [link.cardId],
      }),
      201,
    );
    const page = await seedSession(context, trainer);
    await page.goto(paths.homeCalendar);
    await page.getByRole('button', { name: 'Следующий месяц' }).click();
    const day = page.getByRole('button', { name: String(date.getDate()), exact: true });
    await day.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText(`Клиент ${runId}`);
    await expect(dialog).toContainText('18:30');
    await dialog.getByRole('button', { name: 'Изменить' }).click();
    await page.getByRole('dialog').getByLabel('Время').fill('19:15');
    const [updated] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.request().method() === 'PUT' && r.url().endsWith(`/api/v1/calendar/events/${event.id}`),
      ),
      page.getByRole('dialog').getByRole('button', { name: 'Сохранить' }).click(),
    ]);
    expect(updated.status()).toBe(200);
    await page.reload();
    await page.getByRole('button', { name: 'Следующий месяц' }).click();
    await day.click();
    await expect(page.getByRole('dialog')).toContainText('19:15');
    const [cancelled] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.request().method() === 'DELETE' &&
          r.url().endsWith(`/api/v1/calendar/events/${event.id}`),
      ),
      page.getByRole('dialog').getByRole('button', { name: 'Отменить' }).click(),
    ]);
    expect(cancelled.status()).toBe(204);
    await page.reload();
    await page.getByRole('button', { name: 'Следующий месяц' }).click();
    await day.click();
    await expect(
      page.getByRole('dialog').getByRole('heading', { name: 'Записать клиента' }),
    ).toBeVisible();
  });

  test('NAV-06 уведомления становятся прочитанными ровно один раз @core', async ({
    context,
    freshClient,
    freshTrainer,
    api,
  }) => {
    await api.expectOk(
      'prepare link notification',
      api.post('/api/v1/link-requests', freshClient.tokens, { query: freshTrainer.user.email }),
      201,
    );
    const before = await api.expectOk<{ unread: number }>(
      'notification count before',
      api.get('/api/v1/notifications', freshTrainer.tokens),
      200,
    );
    expect(before.unread).toBeGreaterThan(0);
    const page = await seedSession(context, freshTrainer);
    await expect(page.getByLabel(`Непрочитанные уведомления: ${before.unread}`)).toBeVisible();
    await page.getByRole('button', { name: 'Уведомления' }).click();
    const [read] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' && r.url().endsWith('/api/v1/notifications/read-all'),
      ),
      page.getByRole('button', { name: 'Отметить все прочитанными' }).click(),
    ]);
    expect(read.status()).toBe(200);
    await expect(page.getByRole('button', { name: 'Отметить все прочитанными' })).toHaveCount(0);
    await page.reload();
    const after = await api.expectOk<{ unread: number }>(
      'notification count after',
      api.get('/api/v1/notifications', freshTrainer.tokens),
      200,
    );
    expect(after.unread).toBe(0);
    await expect(page.getByRole('button', { name: 'Отметить все прочитанными' })).toHaveCount(0);
  });

  test('NAV-07 уведомление открывает конкретную заявку @core', async ({
    context,
    freshClient,
    freshTrainer,
    api,
    runId,
  }) => {
    const request = await api.expectOk<{ id: string }>(
      'prepare link request',
      api.post('/api/v1/link-requests', freshClient.tokens, { query: freshTrainer.user.email }),
      201,
    );
    const page = await seedSession(context, freshTrainer);
    await page.goto(paths.homeNotifications);
    await page.getByRole('list').getByRole('button').first().click();
    // Общий список заявок недостаточен: переход должен указывать на запись,
    // которая породила уведомление, даже при нескольких ожидающих запросах.
    await expect(page).toHaveURL(new RegExp(`${paths.connections}.*${request.id}`));
    await expect(page.getByText(`Клиент ${runId}`, { exact: true })).toBeVisible();
    await expect(page.getByRole('listitem')).toHaveCount(1);
  });

  test('NAV-07 недоступная заявка из уведомления даёт понятное состояние @core', async ({
    context,
    freshClient,
    freshTrainer,
    api,
  }) => {
    const request = await api.expectOk<{ id: string }>(
      'prepare link request',
      api.post('/api/v1/link-requests', freshClient.tokens, { query: freshTrainer.user.email }),
      201,
    );
    const cancelled = await api.delete(`/api/v1/link-requests/${request.id}`, freshClient.tokens);
    expect(cancelled.status()).toBe(204);
    const page = await seedSession(context, freshTrainer);
    await page.goto(paths.homeNotifications);
    await page.getByRole('list').getByRole('button').first().click();
    await expect(page).toHaveURL(new RegExp(`${paths.connections}.*${request.id}`));
    await expect(page.getByText('Заявка недоступна')).toBeVisible();
    await expect(page.getByRole('listitem')).toHaveCount(0);
  });

  test('NAV-08 пустые экраны понятны и не переполняют узкий экран @core @narrow', async ({
    context,
    freshClient,
  }) => {
    const page = await seedSession(context, freshClient);
    await expect(page.getByRole('heading', { name: 'Календарь' })).toBeVisible();
    await page.getByRole('button', { name: 'Сменить упражнение', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('Пока нет упражнений с записанным весом');
    await page.getByRole('dialog').getByRole('button', { name: 'Закрыть' }).click();

    await page.goto(paths.homeCalendar);
    await expect(page.getByText('Личных тренировок:')).toBeVisible();
    await expect(page.getByText('Запланировано')).toBeVisible();
    await page.goto(paths.homeNotifications);
    await expect(page.getByText('Нет новых уведомлений')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Отметить все прочитанными' })).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
});
