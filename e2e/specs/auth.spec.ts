import type { Page } from '@playwright/test';

import {
  DEMO_PASSWORD,
  DEMO_TRAINER_EMAIL,
  DEV_VERIFICATION_CODE,
  RESEND_VERIFICATION_CODE,
  SECOND_RESEND_VERIFICATION_CODE,
  seedSession,
  type Session,
} from '../fixtures/accounts.ts';
import type { Api } from '../fixtures/api.ts';
import { nextAccountLabel, runEmail } from '../fixtures/run-id.ts';
import { expect, test } from '../fixtures/test.ts';
import { paths } from '../support/paths.ts';

async function enterCode(page: Page, code = DEV_VERIFICATION_CODE): Promise<void> {
  await page.getByRole('textbox', { name: 'Код подтверждения' }).fill(code);
}

async function registerThroughUi(
  page: Page,
  email: string,
  role: 'client' | 'trainer',
): Promise<void> {
  await page.goto(paths.register);
  await page
    .getByRole('textbox', { name: 'Имя' })
    .fill(role === 'client' ? 'Новый клиент' : 'Новый тренер');
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  // Нативный radio скрыт под оформленной меткой, поэтому пользователь нажимает
  // видимый текст метки; событие всё равно выбирает связанный radio.
  if (role === 'trainer') await page.getByText('Я тренер', { exact: true }).click();
  const registration = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/auth/register') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Далее' }).click();
  expect((await registration).status()).toBe(201);
  await expect(page.getByRole('heading', { name: 'Подтвердите email' })).toBeVisible();
  await enterCode(page);
  await expect(page.getByRole('heading', { name: 'Расскажите о себе' })).toBeVisible();
  await page.getByText('Мужской', { exact: true }).click();
  await page.getByLabel('Дата рождения').fill('1990-05-15');
  await page.getByLabel('Вес, кг').fill('80');
  await page.getByLabel('Рост, см').fill('180');
  await page.getByRole('button', { name: role === 'client' ? 'Завершить' : 'Продолжить' }).click();
  if (role === 'trainer') {
    await page.getByLabel('Клиентов в месяц').fill('10');
    await page.getByRole('button', { name: 'Завершить' }).click();
  }
  await expect(page).toHaveURL(new RegExp(`${paths.home}$`));
}

async function logout(page: Page): Promise<void> {
  await page.goto(paths.settings);
  await page.getByRole('button', { name: 'Выйти' }).click();
  // The route guard changes the URL before logout finishes its hard navigation.
  await Promise.all([
    page.waitForEvent('load'),
    page.getByRole('dialog').getByRole('button', { name: 'Выйти' }).click(),
  ]);
  await expect(page).toHaveURL(new RegExp(`${paths.welcome}$`));
}

async function requestLoginCode(page: Page, email: string): Promise<void> {
  await page.goto(paths.login);
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByRole('button', { name: 'Получить код' }).click();
  await expect(page.getByRole('heading', { name: 'Введите код' })).toBeVisible();
}

async function preparePasswordAccount(api: Api, email: string, password: string): Promise<Session> {
  // Восстановление пароля проверяет UI; регистрация здесь только предпосылка.
  const registration = await api.expectOk<{ registration_token: string }>(
    'register password account',
    api.anonymous('/api/v1/auth/register', {
      email,
      full_name: 'Клиент для восстановления',
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
  await api.expectOk(
    'complete onboarding',
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

/**
 * Раздел A из docs/e2e-spec.md. Демо-аккаунты созданы с
 * `login_method: "password"`, поэтому AUTH-07 проверяет именно вход по паролю:
 * код для этих аккаунтов не подходит.
 */
test.describe('A. Регистрация, вход и сессии', () => {
  test('AUTH-01 регистрация клиента с подтверждением и онбордингом @smoke', async ({
    page,
    runId,
  }) => {
    const email = runEmail(runId, nextAccountLabel('ui-client'));
    await registerThroughUi(page, email, 'client');
    await page.reload();
    await expect(page).toHaveURL(new RegExp(`${paths.home}$`));
    await page.goto(paths.settings);
    await expect(page.getByText(email)).toBeVisible();
  });

  test('AUTH-02 регистрация тренера открывает тренерский аккаунт @smoke', async ({
    page,
    runId,
  }) => {
    const email = runEmail(runId, nextAccountLabel('ui-trainer'));
    await registerThroughUi(page, email, 'trainer');
    await page.reload();
    await page.goto(paths.settings);
    await expect(page.getByText(email)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Мои клиенты' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Мой тренер' })).toHaveCount(0);
  });

  test('AUTH-03 некорректные поля не создают аккаунт', async ({ page, runId }) => {
    const email = runEmail(runId, nextAccountLabel('invalid'));
    let registrations = 0;
    page.on('request', (request) => {
      if (request.url().endsWith('/api/v1/auth/register') && request.method() === 'POST')
        registrations += 1;
    });
    await page.goto(paths.register);
    await page.getByRole('button', { name: 'Далее' }).click();
    await expect(page.getByText('Введите имя')).toBeVisible();
    await expect(page.getByText('Введите корректный email')).toBeVisible();
    await page.getByRole('textbox', { name: 'Имя' }).fill('А');
    await page.getByRole('textbox', { name: 'Email' }).fill('wrong-email');
    await page.getByRole('button', { name: 'Далее' }).click();
    await expect(page.getByText('Введите имя')).toBeVisible();
    await expect(page.getByText('Введите корректный email')).toBeVisible();
    expect(registrations).toBe(0);
    // Тот же адрес после исправления должен пройти регистрацию: ошибки формы
    // не должны резервировать аккаунт на сервере.
    await page.getByRole('textbox', { name: 'Имя' }).fill('Валидный клиент');
    await page.getByRole('textbox', { name: 'Email' }).fill(email);
    await page.getByRole('button', { name: 'Далее' }).click();
    await expect(page.getByRole('heading', { name: 'Подтвердите email' })).toBeVisible();
    expect(registrations).toBe(1);
  });

  test('AUTH-04 неверный и просроченный коды отклоняются, новый завершает регистрацию', async ({
    page,
    runId,
  }) => {
    test.setTimeout(100_000);
    const email = runEmail(runId, nextAccountLabel('wrong-code'));
    await page.goto(paths.register);
    await page.getByRole('textbox', { name: 'Имя' }).fill('Клиент с кодом');
    await page.getByRole('textbox', { name: 'Email' }).fill(email);
    await page.getByRole('button', { name: 'Далее' }).click();
    await expect(page.getByRole('heading', { name: 'Подтвердите email' })).toBeVisible();
    const invalid = page.waitForResponse((response) =>
      response.url().endsWith('/api/v1/auth/register/verify'),
    );
    await enterCode(page, '999999');
    expect((await invalid).status()).toBe(422);
    await expect(page.getByRole('alert')).toHaveText('Неверный или просроченный код');
    // Таймер интерфейса и TTL backend равны минуте. Ждём доступного действия,
    // а не паузы: код должен истечь на сервере до повторной отправки.
    await expect(page.getByRole('button', { name: 'Отправить ещё раз', exact: true })).toBeEnabled({
      timeout: 70_000,
    });
    const expired = page.waitForResponse((response) =>
      response.url().endsWith('/api/v1/auth/register/verify'),
    );
    await enterCode(page);
    expect((await expired).status()).toBe(404);
    await expect(page.getByRole('alert')).toHaveText('Неверный или просроченный код');
    const resend = page.waitForResponse((response) =>
      response.url().endsWith('/api/v1/auth/resend-code'),
    );
    await page.getByRole('button', { name: 'Отправить ещё раз', exact: true }).click();
    expect((await resend).status()).toBe(200);
    await enterCode(page, RESEND_VERIFICATION_CODE);
    await expect(page.getByRole('heading', { name: 'Расскажите о себе' })).toBeVisible();
  });

  test('AUTH-05 повторная отправка меняет код и объясняет лимит запросов', async ({
    page,
    runId,
  }) => {
    const email = runEmail(runId, nextAccountLabel('resend'));
    await page.clock.install();
    await page.goto(paths.register);
    await page.getByRole('textbox', { name: 'Имя' }).fill('Клиент с повтором');
    await page.getByRole('textbox', { name: 'Email' }).fill(email);
    await page.getByRole('button', { name: 'Далее' }).click();
    await expect(page.getByRole('heading', { name: 'Подтвердите email' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Отправить ещё раз/ })).toBeDisabled();
    await page.clock.runFor(60_000);
    const resend = page.waitForResponse((response) =>
      response.url().endsWith('/api/v1/auth/resend-code'),
    );
    await page.getByRole('button', { name: 'Отправить ещё раз', exact: true }).click();
    expect((await resend).status()).toBe(200);
    await expect(page.getByRole('button', { name: /Отправить ещё раз/ })).toBeDisabled();
    const oldCode = page.waitForResponse((response) =>
      response.url().endsWith('/api/v1/auth/register/verify'),
    );
    await enterCode(page);
    expect((await oldCode).status()).toBe(422);
    await expect(page.getByRole('alert')).toHaveText('Неверный или просроченный код');
    await page.clock.runFor(60_000);
    const secondResend = page.waitForResponse((response) =>
      response.url().endsWith('/api/v1/auth/resend-code'),
    );
    await page.getByRole('button', { name: 'Отправить ещё раз', exact: true }).click();
    expect((await secondResend).status()).toBe(200);
    await page.clock.runFor(60_000);
    const limited = page.waitForResponse((response) =>
      response.url().endsWith('/api/v1/auth/resend-code'),
    );
    await page.getByRole('button', { name: 'Отправить ещё раз', exact: true }).click();
    expect((await limited).status()).toBe(429);
    await expect(page.getByRole('button', { name: /Отправить ещё раз/ })).toBeDisabled();
    await enterCode(page, SECOND_RESEND_VERIFICATION_CODE);
    await expect(page.getByRole('heading', { name: 'Расскажите о себе' })).toBeVisible();
  });

  test('AUTH-06 вход клиента по коду живёт после reload и в новой вкладке @smoke', async ({
    page,
    context,
    freshClient,
  }) => {
    const email = freshClient.user.email;
    expect(email).not.toBeNull();
    await seedSession(context, freshClient);
    await logout(page);
    await requestLoginCode(page, email!);
    await enterCode(page);
    await expect(page).toHaveURL(new RegExp(`${paths.home}$`));
    await page.reload();
    await expect(page).toHaveURL(new RegExp(`${paths.home}$`));
    const second = await context.newPage();
    await second.goto(paths.settings);
    await expect(second.getByText(email!)).toBeVisible();
  });

  test('AUTH-07 вход тренера по паролю @smoke', async ({ page }) => {
    await page.goto(paths.login);
    await page.getByRole('button', { name: 'Войти по паролю' }).click();

    // Роль, а не просто доступное имя: рядом с полем стоит кнопка «Показать
    // пароль», и `getByLabel('Пароль')` совпадает с обеими.
    const password = page.getByRole('textbox', { name: 'Пароль' });

    // Негативный путь первым: неверный пароль не должен впускать, и только
    // после этого тот же экран обязан принять верный.
    await page.getByRole('textbox', { name: 'Email' }).fill(DEMO_TRAINER_EMAIL);
    await password.fill('WrongPass1');
    await page.getByRole('button', { name: 'Войти', exact: true }).click();

    await expect(page.getByRole('alert')).toHaveText('Неверный email или пароль');
    await expect(page).toHaveURL(new RegExp(`${paths.login}$`));

    await password.fill(DEMO_PASSWORD);
    await page.getByRole('button', { name: 'Войти', exact: true }).click();

    // Оракул — попадание в свой аккаунт, а не исчезновение формы: редирект
    // объявлен гардом роутера и срабатывает ровно на установленную сессию.
    await expect(page).toHaveURL(new RegExp(`${paths.home}$`));
    await expect(page.getByRole('navigation', { name: 'Основная навигация' })).toBeVisible();
  });

  test('AUTH-08 восстановление пароля меняет вход и отзывает старую сессию', async ({
    page,
    api,
    runId,
  }) => {
    const email = runEmail(runId, nextAccountLabel('password-reset'));
    const oldPassword = 'OldPassword1';
    const newPassword = 'NewPassword2';
    const original = await preparePasswordAccount(api, email, oldPassword);
    await page.goto(paths.passwordReset);
    await page.getByRole('textbox', { name: 'Email' }).fill(email);
    await page.getByRole('button', { name: 'Далее' }).click();
    await expect(page.getByRole('heading', { name: 'Введите код' })).toBeVisible();
    await enterCode(page);
    await expect(page.getByRole('heading', { name: 'Новый пароль' })).toBeVisible();
    await page.getByRole('textbox', { name: 'Пароль', exact: true }).fill(newPassword);
    await page.getByRole('textbox', { name: 'Повторите пароль' }).fill(newPassword);
    await page.getByRole('button', { name: 'Сохранить' }).click();
    await expect(page).toHaveURL(new RegExp(`${paths.login}$`));

    // Политика backend отзывает refresh-токены при смене пароля, поэтому
    // проверяем прежнюю сессию на реальном endpoint, а вход — через экран.
    const revoked = await api.anonymous('/api/v1/auth/refresh', {
      refresh_token: original.tokens.refresh_token,
    });
    expect(revoked.status()).toBe(401);
    await page.getByRole('button', { name: 'Войти по паролю' }).click();
    await page.getByRole('textbox', { name: 'Email' }).fill(email);
    await page.getByRole('textbox', { name: 'Пароль' }).fill(oldPassword);
    await page.getByRole('button', { name: 'Войти', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Неверный email или пароль');
    await page.getByRole('textbox', { name: 'Пароль' }).fill(newPassword);
    await page.getByRole('button', { name: 'Войти', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${paths.home}$`));
  });

  test('AUTH-09 выход закрывает личные данные во второй вкладке @smoke @security', async ({
    page,
    context,
    freshClient,
  }) => {
    await seedSession(context, freshClient);
    const second = await context.newPage();
    await second.goto(paths.settings);
    await expect(second.getByText(freshClient.user.email!)).toBeVisible();
    await logout(page);
    // Обе проверки нужны: открытая вкладка не должна оставлять чужую карточку
    // на экране, а reload не должен восстановить её из IndexedDB.
    await expect.soft(second).toHaveURL(new RegExp(`${paths.welcome}$`));
    await expect.soft(second.getByText(freshClient.user.email!)).toHaveCount(0);
    await second.reload();
    await expect(second).toHaveURL(new RegExp(`${paths.welcome}$`));
    await expect(second.getByText(freshClient.user.email!)).toHaveCount(0);
  });

  test('AUTH-10 прямой защищённый URL не раскрывает прошлый аккаунт @smoke @security', async ({
    page,
    context,
    freshClient,
  }) => {
    await seedSession(context, freshClient);
    await page.goto(paths.settings);
    await expect(page.getByText(freshClient.user.email!)).toBeVisible();
    await logout(page);
    await page.goto(paths.settingsProfile);
    await expect(page).toHaveURL(new RegExp(`${paths.welcome}$`));
    await expect(page.getByText(freshClient.user.email!)).toHaveCount(0);
    const anonymous = await context.browser()!.newContext({ baseURL: new URL(page.url()).origin });
    try {
      const guest = await anonymous.newPage();
      await guest.goto(paths.settingsProfile);
      await expect(guest).toHaveURL(new RegExp(`${paths.welcome}$`));
      await expect(guest.getByText(freshClient.user.email!)).toHaveCount(0);
    } finally {
      await anonymous.close();
    }
  });

  test('AUTH-11 истёкший access обновляется, недействительный refresh завершает сессию', async ({
    context,
    freshClient,
  }) => {
    const refreshes: number[] = [];
    context.on('response', (response) => {
      if (response.url().endsWith('/api/v1/auth/refresh')) refreshes.push(response.status());
    });
    const expiredAccess = {
      ...freshClient,
      tokens: { ...freshClient.tokens, access_token: 'expired-access-token' },
    };
    const page = await seedSession(context, expiredAccess);
    await page.goto(paths.settings);
    await expect(page.getByText(freshClient.user.email!)).toBeVisible();
    await expect.poll(() => refreshes.length).toBeGreaterThan(0);
    expect(refreshes).toContain(200);
    await page.reload();
    await expect(page.getByText(freshClient.user.email!)).toBeVisible();

    const invalid = await context.browser()!.newContext({ baseURL: new URL(page.url()).origin });
    try {
      const failedRefreshes: number[] = [];
      invalid.on('response', (response) => {
        if (response.url().endsWith('/api/v1/auth/refresh'))
          failedRefreshes.push(response.status());
      });
      const broken = await seedSession(invalid, {
        ...freshClient,
        tokens: { access_token: 'expired-access-token', refresh_token: 'invalid-refresh-token' },
      });
      await broken.goto(paths.settings);
      await expect(broken).toHaveURL(new RegExp(`${paths.welcome}$`));
      expect(failedRefreshes).toEqual([401]);
    } finally {
      await invalid.close();
    }
  });

  test('AUTH-12 запрос кода и восстановления не раскрывает наличие аккаунта @smoke @security', async ({
    page,
    freshClient,
    runId,
  }) => {
    const knownEmail = freshClient.user.email!;
    const unknownEmail = runEmail(runId, nextAccountLabel('unknown'));
    const loginResponses: unknown[] = [];
    const resetResponses: unknown[] = [];
    const loginMessages: string[] = [];
    const resetMessages: string[] = [];
    for (const email of [knownEmail, DEMO_TRAINER_EMAIL, unknownEmail]) {
      await page.goto(paths.login);
      await page.getByRole('textbox', { name: 'Email' }).fill(email);
      const loginRequest = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          response.url().endsWith('/api/v1/auth/login/request-code'),
      );
      await page.getByRole('button', { name: 'Получить код' }).click();
      const loginResponse = await loginRequest;
      expect(loginResponse.status()).toBe(200);
      loginResponses.push(await loginResponse.json());
      await expect(page.getByRole('heading', { name: 'Введите код' })).toBeVisible();
      const loginStatus = page.getByRole('status', { name: 'Отправка кода' });
      await expect(loginStatus).toBeVisible();
      await expect(loginStatus).toContainText(email);
      loginMessages.push(
        (await loginStatus.innerText()).replaceAll(email, '<email>').replace(/\s+/g, ' ').trim(),
      );
      await expect(page.getByRole('textbox', { name: 'Код подтверждения' })).toBeEditable();
      await expect(page.getByRole('button', { name: 'Войти по паролю' })).toBeVisible();
      await page.goto(paths.passwordReset);
      await page.getByRole('textbox', { name: 'Email' }).fill(email);
      const resetRequest = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          response.url().endsWith('/api/v1/auth/password-reset/request'),
      );
      await page.getByRole('button', { name: 'Далее' }).click();
      const resetResponse = await resetRequest;
      expect(resetResponse.status()).toBe(200);
      resetResponses.push(await resetResponse.json());
      await expect(page.getByRole('heading', { name: 'Введите код' })).toBeVisible();
      const resetStatus = page.getByRole('status', { name: 'Отправка кода' });
      await expect(resetStatus).toBeVisible();
      await expect(resetStatus).toContainText(email);
      resetMessages.push(
        (await resetStatus.innerText()).replaceAll(email, '<email>').replace(/\s+/g, ' ').trim(),
      );
      await expect(page.getByRole('textbox', { name: 'Код подтверждения' })).toBeEditable();
    }
    for (const responses of [loginResponses, resetResponses]) {
      for (const response of responses) expect(response).toEqual(responses[0]);
    }
    expect(new Set(loginMessages).size).toBe(1);
    expect(new Set(resetMessages).size).toBe(1);
  });
});

test('AUTH-07 вход по паролю доступен после запроса кода без потери email @core', async ({
  page,
}) => {
  await page.goto(paths.login);
  await page.getByLabel('Email', { exact: true }).fill(DEMO_TRAINER_EMAIL);
  await page.getByRole('button', { name: 'Получить код', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Введите код' })).toBeVisible();
  await expect(page.getByText(/код для такого аккаунта не отправляется/)).toBeVisible();
  await page.getByRole('button', { name: 'Войти по паролю' }).click();
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(DEMO_TRAINER_EMAIL);
  await page.getByLabel('Пароль', { exact: true }).fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page).toHaveURL(paths.home);
});
