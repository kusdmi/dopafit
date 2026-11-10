import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import type { components } from '../../frontend/src/shared/api/schema.d.ts';

import { DEV_VERIFICATION_CODE, seedSession, type Session } from '../fixtures/accounts.ts';
import type { Api } from '../fixtures/api.ts';
import { nextAccountLabel, runEmail } from '../fixtures/run-id.ts';
import { expect, test } from '../fixtures/test.ts';
import { paths, supportThread } from '../support/paths.ts';

type Me = components['schemas']['MeOut'];
type Ticket = components['schemas']['TicketOut'];
type TicketDetail = components['schemas']['TicketDetailOut'];
type NotificationSettings = components['schemas']['NotificationSettingsOut'];

function browserContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({
    baseURL: process.env.E2E_BASE_URL ?? 'http://frontend-e2e:5173',
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
  });
}

async function me(api: Api, session: Session): Promise<Me> {
  return api.expectOk<Me>('current user', api.get('/api/v1/users/me', session.tokens), 200);
}

async function passwordAccount(api: Api, runId: string, password: string): Promise<Session> {
  const email = runEmail(runId, nextAccountLabel('password-settings'));
  const registration = await api.expectOk<{ registration_token: string }>(
    'register isolated password account',
    api.anonymous('/api/v1/auth/register', {
      email,
      full_name: 'Клиент с паролем',
      role: 'client',
      personal_data_consent: true,
    }),
    201,
  );
  const session = await api.expectOk<Session>(
    'set initial password',
    api.anonymous('/api/v1/auth/set-password', {
      registration_token: registration.registration_token,
      password,
    }),
    200,
  );
  // Password registration leaves email unverified; verify through API so the
  // security screen tests password handling rather than the email gate.
  await api.expectOk(
    'verify isolated password account',
    api.anonymous('/api/v1/auth/register/verify', { email, code: DEV_VERIFICATION_CODE }),
    200,
  );
  await api.expectOk(
    'complete isolated account onboarding',
    api.post('/api/v1/users/me/onboarding', session.tokens, {
      gender: 'male',
      birth_date: '1990-05-15',
      height: 180,
      weight: 80,
    }),
    200,
  );
  return session;
}

async function sendTicket(page: Page, subject: string, message: string): Promise<void> {
  await page.goto(paths.support);
  await page.getByRole('textbox', { name: 'Тема обращения' }).fill(subject);
  await page.getByRole('textbox', { name: 'Сообщение' }).fill(message);
  const [created] = await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().endsWith('/api/v1/support/tickets'),
    ),
    page.getByRole('button', { name: 'Отправить', exact: true }).click(),
  ]);
  expect(created.status()).toBe(201);
}

test.describe('K. Настройки, безопасность и поддержка', () => {
  test('SET-01 профиль клиента и тренера сохраняет правку после reload @core', async ({
    browser,
    freshClient,
    freshTrainer,
    api,
    runId,
  }) => {
    for (const [role, session] of [
      ['Клиент', freshClient],
      ['Тренер', freshTrainer],
    ] as const) {
      const context = await browserContext(browser);
      try {
        const page = await seedSession(context, session);
        await page.goto(paths.settingsProfile);
        const fullName = role + ' профиль ' + runId;
        const city = 'Казань';
        await page.getByRole('textbox', { name: 'Имя' }).fill(fullName);
        await page.getByRole('textbox', { name: 'Город' }).fill(city);
        await page.getByRole('textbox', { name: 'Травмы и ограничения' }).fill('Без ограничений');
        const [saved] = await Promise.all([
          page.waitForResponse(
            (r) => r.request().method() === 'PATCH' && r.url().endsWith('/api/v1/users/me'),
          ),
          page.getByRole('button', { name: 'Сохранить профиль', exact: true }).click(),
        ]);
        expect(saved.status()).toBe(200);
        await page.reload();
        await expect(page.getByRole('textbox', { name: 'Имя' })).toHaveValue(fullName);
        await expect(page.getByRole('textbox', { name: 'Город' })).toHaveValue(city);
        await expect(page.getByRole('textbox', { name: 'Травмы и ограничения' })).toHaveValue(
          'Без ограничений',
        );
        expect((await me(api, session)).profile).toMatchObject({
          first_name: fullName,
          city,
          injuries: 'Без ограничений',
        });
      } finally {
        await context.close();
      }
    }
  });

  test('SET-02 подтверждённый новый email заменяет старый контакт @core', async ({
    context,
    freshClient,
    api,
    runId,
  }) => {
    const oldEmail = freshClient.user.email!;
    const newEmail = runEmail(runId, nextAccountLabel('contact'));
    const page = await seedSession(context, freshClient);
    await page.goto(paths.settingsContacts);
    await page.getByRole('button', { name: 'Изменить' }).click();
    await page.getByRole('textbox', { name: 'Новый email' }).fill(newEmail);
    const [requested] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' &&
          r.url().endsWith('/api/v1/users/me/contact/change-request'),
      ),
      page.getByRole('button', { name: 'Сохранить', exact: true }).click(),
    ]);
    expect(requested.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Подтвердите новый email' })).toBeVisible();
    const [confirmed] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' &&
          r.url().endsWith('/api/v1/users/me/contact/change-confirm'),
      ),
      page.getByRole('textbox', { name: 'Код подтверждения' }).fill(DEV_VERIFICATION_CODE),
    ]);
    expect(confirmed.status()).toBe(200);
    await page.reload();
    await expect(page.getByText(newEmail, { exact: true })).toBeVisible();
    expect((await me(api, freshClient)).user.email).toBe(newEmail);
    expect((await me(api, freshClient)).user.email).not.toBe(oldEmail);
    // Для старого адреса auth сохраняет одинаковый ответ на запрос кода,
    // поэтому запрет подтверждаем следующим шагом, не раскрывающим аккаунт.
    expect(
      (await api.anonymous('/api/v1/auth/login/request-code', { contact: oldEmail })).status(),
    ).toBe(200);
    expect(
      (
        await api.anonymous('/api/v1/auth/login/verify-code', {
          contact: oldEmail,
          code: DEV_VERIFICATION_CODE,
        })
      ).status(),
    ).toBe(404);
  });

  test('SET-03 неверный код смены контакта оставляет прежний email @core', async ({
    context,
    freshClient,
    api,
    runId,
  }) => {
    const oldEmail = freshClient.user.email!;
    const page = await seedSession(context, freshClient);
    await page.goto(paths.settingsContacts);
    await page.getByRole('button', { name: 'Изменить' }).click();
    await page
      .getByRole('textbox', { name: 'Новый email' })
      .fill(runEmail(runId, nextAccountLabel('wrong-code')));
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Подтвердите новый email' })).toBeVisible();
    const [rejected] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' &&
          r.url().endsWith('/api/v1/users/me/contact/change-confirm'),
      ),
      page.getByRole('textbox', { name: 'Код подтверждения' }).fill('123456'),
    ]);
    expect(rejected.status()).toBe(422);
    await expect(page.getByRole('alert')).toHaveText('Неверный или просроченный код');
    expect((await me(api, freshClient)).user.email).toBe(oldEmail);
  });

  test('SET-04 смена пароля проверяет старый и принимает только новый @core @security', async ({
    context,
    api,
    runId,
  }) => {
    const oldPassword = 'OldPassword1';
    const newPassword = 'NewPassword2';
    const session = await passwordAccount(api, runId, oldPassword);
    const page = await seedSession(context, session);
    await page.goto(paths.settingsSecurity);
    await page.getByRole('textbox', { name: 'Текущий пароль' }).fill('WrongPassword1');
    await page.getByRole('textbox', { name: 'Новый пароль' }).fill(newPassword);
    await page.getByRole('textbox', { name: 'Повторите пароль' }).fill(newPassword);
    const [rejected] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' && r.url().endsWith('/api/v1/users/me/change-password'),
      ),
      page.getByRole('button', { name: 'Сохранить пароль' }).click(),
    ]);
    expect(rejected.status()).toBe(422);
    await expect(page.getByRole('alert')).toBeVisible();
    await page.getByRole('textbox', { name: 'Текущий пароль' }).fill(oldPassword);
    const [changed] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' && r.url().endsWith('/api/v1/users/me/change-password'),
      ),
      page.getByRole('button', { name: 'Сохранить пароль' }).click(),
    ]);
    expect(changed.status()).toBe(200);
    expect(
      (
        await api.anonymous('/api/v1/auth/login', {
          contact: session.user.email,
          password: oldPassword,
        })
      ).status(),
    ).toBe(401);
    const renewed = await api.login(session.user.email!, newPassword);
    expect(renewed.user.id).toBe(session.user.id);
  });

  test('SET-05 способ входа меняется кодом и работает после нового входа @core @security', async ({
    context,
    api,
    runId,
  }) => {
    const password = 'MethodPass1';
    const session = await passwordAccount(api, runId, password);
    const page = await seedSession(context, session);
    await page.goto(paths.settingsSecurity);
    await page.getByRole('radio', { name: /Код на email/ }).click();
    await expect(
      page.getByRole('heading', { name: 'Подтвердите смену способа входа' }),
    ).toBeVisible();
    const [changed] = await Promise.all([
      page.waitForResponse(
        (r) => r.request().method() === 'PUT' && r.url().endsWith('/api/v1/users/me/login-method'),
      ),
      page.getByRole('textbox', { name: 'Код подтверждения' }).fill(DEV_VERIFICATION_CODE),
    ]);
    expect(changed.status()).toBe(200);
    await page.reload();
    await expect(page.getByRole('radio', { name: /Код на email/ })).toBeChecked();
    expect((await me(api, session)).user.login_method).toBe('code');
    const requested = await api.anonymous('/api/v1/auth/login/request-code', {
      contact: session.user.email,
    });
    expect(requested.status()).toBe(200);
    const signedIn = await api.anonymous('/api/v1/auth/login/verify-code', {
      contact: session.user.email,
      code: DEV_VERIFICATION_CODE,
    });
    expect(signedIn.status()).toBe(200);
  });

  test('SET-06 темы действуют на основных экранах и переживают новый вход @core', async ({
    browser,
    context,
    freshClient,
    api,
  }) => {
    const page = await seedSession(context, freshClient);
    const routes = [
      paths.home,
      paths.measurements,
      paths.programs,
      paths.analytics,
      paths.settings,
    ];
    for (const [label, value] of [
      ['Тёмная', 'dark'],
      ['Светлая', 'light'],
    ] as const) {
      await page.goto(paths.settingsTheme);
      const [savedTheme] = await Promise.all([
        page.waitForResponse(
          (r) => r.request().method() === 'PUT' && r.url().endsWith('/api/v1/users/me/settings'),
        ),
        page.getByRole('button', { name: new RegExp('^' + label) }).click(),
      ]);
      expect(savedTheme.status()).toBe(200);
      for (const route of routes) {
        await page.goto(route);
        await expect
          .poll(() => page.evaluate(() => document.documentElement.getAttribute('data-theme')))
          .toBe(value);
        await expect(page.getByRole('navigation', { name: 'Основная навигация' })).toBeVisible();
      }
    }
    await page.goto(paths.settingsTheme);
    const [systemSaved] = await Promise.all([
      page.waitForResponse(
        (r) => r.request().method() === 'PUT' && r.url().endsWith('/api/v1/users/me/settings'),
      ),
      page.getByRole('button', { name: /^Системная/ }).click(),
    ]);
    expect(systemSaved.status()).toBe(200);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.getAttribute('data-theme')))
      .toBeNull();
    await page.reload();
    await expect(page.getByRole('button', { name: /^Системная/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const saved = await api.expectOk<{ theme: string }>(
      'saved theme',
      api.get('/api/v1/users/me/settings', freshClient.tokens),
      200,
    );
    expect(saved.theme).toBe('system');
    const secondContext = await browserContext(browser);
    try {
      const newLogin = await seedSession(secondContext, freshClient);
      await newLogin.goto(paths.settingsTheme);
      await expect(newLogin.getByRole('button', { name: /^Системная/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    } finally {
      await secondContext.close();
    }
  });

  test('SET-07 категории уведомлений сохраняются независимо @core', async ({
    context,
    freshClient,
    api,
  }) => {
    const page = await seedSession(context, freshClient);
    await page.goto(paths.settingsNotifications);
    const workout = page.getByRole('switch', { name: 'Напоминания о тренировках' });
    const measurement = page.getByRole('switch', { name: 'Напоминания о замерах' });
    const progress = page.getByRole('switch', { name: 'Обновления прогресса' });
    await expect(workout).toBeChecked();
    await expect(measurement).toBeChecked();
    await expect(progress).toBeChecked();
    const [workoutSaved] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.request().method() === 'PATCH' && r.url().endsWith('/api/v1/notifications/settings'),
      ),
      workout.click(),
    ]);
    expect(workoutSaved.status()).toBe(200);
    const [progressSaved] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.request().method() === 'PATCH' && r.url().endsWith('/api/v1/notifications/settings'),
      ),
      progress.click(),
    ]);
    expect(progressSaved.status()).toBe(200);
    await page.reload();
    await expect(workout).not.toBeChecked();
    await expect(measurement).toBeChecked();
    await expect(progress).not.toBeChecked();
    const settings = await api.expectOk<NotificationSettings>(
      'notification categories',
      api.get('/api/v1/notifications/settings', freshClient.tokens),
      200,
    );
    expect(settings).toMatchObject({
      push_enabled: true,
      workout_reminders: false,
      measurement_reminders: true,
      progress_updates: false,
    });
    // Связь с типом события задаёт контракт deliveryEnabled: workout_reminder
    // использует workout_reminders, тогда как остальные категории независимы.
  });

  test('SET-08 отклонённый push не запрашивается повторно @core', async ({ freshClient }) => {
    const origin = process.env.E2E_BASE_URL ?? 'http://frontend-e2e:5173';
    // The local HTTP origin needs a secure-context override for Chromium PushManager.
    const browser = await chromium.launch({
      args: [`--unsafely-treat-insecure-origin-as-secure=${origin}`],
    });
    const context = await browser.newContext({ baseURL: origin, locale: 'ru-RU' });
    try {
      await context.grantPermissions([], { origin });
      const page = await seedSession(context, freshClient);
      await page.goto(paths.settingsNotifications);
      await expect(page.getByText(/Уведомления заблокированы в настройках браузера/)).toBeVisible();
      await expect(page.getByText(/откройте настройки сайта/)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Включить уведомления' })).toHaveCount(0);
      await page.reload();
      await expect(page.getByText(/Уведомления заблокированы в настройках браузера/)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Включить уведомления' })).toHaveCount(0);
    } finally {
      await browser.close();
    }
  });

  test('SET-09 обращение отправляется и открывается после reload @core', async ({
    context,
    freshClient,
    api,
    runId,
  }) => {
    const subject = 'Вопрос ' + runId;
    const message = 'Помогите проверить историю тренировок';
    const page = await seedSession(context, freshClient);
    await sendTicket(page, subject, message);
    await expect(page.getByText('Спасибо за обращение!')).toBeVisible();
    await page.getByRole('link', { name: 'Мои обращения' }).click();
    await expect(page.getByRole('link', { name: new RegExp(subject) })).toBeVisible();
    await page.reload();
    await page.getByRole('link', { name: new RegExp(subject) }).click();
    await expect(page.getByRole('heading', { name: subject })).toBeVisible();
    await expect(page.getByText(message)).toBeVisible();
    const tickets = await api.expectOk<Ticket[]>(
      'created support ticket',
      api.get('/api/v1/support/tickets', freshClient.tokens),
      200,
    );
    expect(tickets.filter((item) => item.subject === subject)).toHaveLength(1);
  });

  test('SET-10 ответ в теме сохраняет порядок и закрыт от чужого аккаунта @core @security', async ({
    context,
    freshClient,
    freshTrainer,
    api,
    runId,
  }) => {
    const subject = 'Тема ' + runId;
    const initial = 'Первый вопрос';
    const firstReply = 'Первое уточнение';
    const secondReply = 'Второе уточнение';
    const ticket = await api.expectOk<Ticket>(
      'prepare support ticket',
      api.post('/api/v1/support/tickets', freshClient.tokens, { subject, message: initial }),
      201,
    );
    const page = await seedSession(context, freshClient);
    await page.goto(supportThread(ticket.id));
    for (const reply of [firstReply, secondReply]) {
      await page.getByRole('textbox', { name: 'Ваш ответ' }).fill(reply);
      const [sent] = await Promise.all([
        page.waitForResponse(
          (r) =>
            r.request().method() === 'POST' &&
            r.url().endsWith('/api/v1/support/tickets/' + ticket.id + '/replies'),
        ),
        page.getByRole('button', { name: 'Отправить', exact: true }).click(),
      ]);
      expect(sent.status()).toBe(200);
      await expect(page.getByText(reply)).toBeVisible();
    }
    await page.reload();
    await expect(page.getByText(initial)).toBeVisible();
    const detail = await api.expectOk<TicketDetail>(
      'support thread after reload',
      api.get('/api/v1/support/tickets/' + ticket.id, freshClient.tokens),
      200,
    );
    expect(detail.replies.map((reply) => reply.body)).toEqual([firstReply, secondReply]);
    expect(
      (await api.get('/api/v1/support/tickets/' + ticket.id, freshTrainer.tokens)).status(),
    ).toBe(403);
  });

  test('SET-11 граничная длина сообщения проверяется у поля до отправки @core', async ({
    context,
    freshClient,
    api,
    runId,
  }) => {
    const subject = 'Лимиты ' + runId;
    const page = await seedSession(context, freshClient);
    await page.goto(paths.support);
    await page.getByRole('textbox', { name: 'Тема обращения' }).fill(subject);
    const message = page.getByRole('textbox', { name: 'Сообщение' });
    await expect(page.getByRole('button', { name: 'Отправить', exact: true })).toBeDisabled();
    const boundary = 'а'.repeat(5000);
    await message.fill(boundary);
    const [accepted] = await Promise.all([
      page.waitForResponse(
        (r) => r.request().method() === 'POST' && r.url().endsWith('/api/v1/support/tickets'),
      ),
      page.getByRole('button', { name: 'Отправить', exact: true }).click(),
    ]);
    expect(accepted.status()).toBe(201);
    await page.goto(paths.support);
    await page.getByRole('textbox', { name: 'Тема обращения' }).fill(subject + ' длинное');
    const tooLong = 'б'.repeat(5001);
    await message.fill(tooLong);
    let extraPosts = 0;
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/api/v1/support/tickets')) {
        extraPosts += 1;
      }
    });
    await page.getByRole('button', { name: 'Отправить', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('5000');
    await expect(message).toHaveValue(tooLong);
    expect(extraPosts).toBe(0);
    const tickets = await api.expectOk<Ticket[]>(
      'support tickets after invalid length',
      api.get('/api/v1/support/tickets', freshClient.tokens),
      200,
    );
    expect(tickets.filter((ticket) => ticket.subject.startsWith(subject))).toHaveLength(1);
  });

  test('SET-12 запрос удаления можно отменить до подтверждения @core @security', async ({
    context,
    freshClient,
    api,
  }) => {
    const page = await seedSession(context, freshClient);
    await page.goto(paths.settingsDelete);
    await expect(page.getByText(/Восстановление невозможно/)).toBeVisible();
    await page.getByRole('button', { name: 'Удалить аккаунт' }).click();
    const warning = page.getByRole('dialog');
    await expect(warning.getByRole('heading', { name: 'Удалить аккаунт навсегда?' })).toBeVisible();
    const [requested] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' && r.url().endsWith('/api/v1/users/me/delete-request'),
      ),
      warning.getByRole('button', { name: 'Удалить', exact: true }).click(),
    ]);
    expect(requested.status()).toBe(200);
    await expect(
      page.getByRole('heading', { name: 'Подтвердите удаление аккаунта' }),
    ).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Отмена' }).click();
    await expect(page.getByRole('button', { name: 'Удалить аккаунт' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Удаление аккаунта' })).toBeVisible();
    expect((await me(api, freshClient)).user.id).toBe(freshClient.user.id);
  });
});
