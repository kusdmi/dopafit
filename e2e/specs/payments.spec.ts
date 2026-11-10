import { seedSession } from '../fixtures/accounts.ts';
import { activateSubscription, referralInfo, registerInvitedClient } from '../fixtures/commerce.ts';
import { nextAccountLabel, runEmail } from '../fixtures/run-id.ts';
import { expect, test } from '../fixtures/test.ts';
import { paths } from '../support/paths.ts';

/** Раздел L: серверные предпосылки оплаты создаёт локальный mock-провайдер. */
test.describe('L. Подписка и реферальная программа', () => {
  test('PAY-01 подключённый Premium сохраняется после reload @core', async ({
    context,
    freshClient,
    api,
  }) => {
    const status = await activateSubscription(api, freshClient);
    expect(status.is_active).toBe(true);
    expect(status.ends_at).toBeNull();
    const page = await seedSession(context, freshClient);
    await page.goto(paths.settingsSubscription);
    await expect(page.getByText('Premium подключён')).toBeVisible();
    await page.reload();
    await expect(page.getByText('Premium подключён')).toBeVisible();
  });
  test('PAY-02 кнопка подключает Premium без оплаты и выбора тарифа @core @smoke', async ({
    context,
    freshClient,
    api,
  }) => {
    const page = await seedSession(context, freshClient);
    await page.goto(paths.settingsSubscription);
    await expect(page.getByText(/тестового запуска/)).toHaveCount(0);
    await expect(page.getByRole('radio')).toHaveCount(0);
    await expect(page.getByText(/₽/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Подарить/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Подключить Premium бесплатно' }).click();
    await expect(page.getByText('Premium подключён')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(paths.settingsSubscription + '$'));
    const status = await api.expectOk<{
      is_active: boolean;
      ends_at: string | null;
      entitlements: { features: { rest_timer: boolean }; limits: { own_programs: number } };
    }>('active', api.get('/api/v1/subscriptions/status', freshClient.tokens), 200);
    expect(status.is_active).toBe(true);
    expect(status.ends_at).toBeNull();
    expect(status.entitlements.features.rest_timer).toBe(true);
    expect(status.entitlements.limits.own_programs).toBe(100);
    await page.reload();
    await expect(page.getByText('Premium подключён')).toBeVisible();
  });
  test('PAY-03 подключение недоступно офлайн @core', async ({ context, freshClient }) => {
    const page = await seedSession(context, freshClient);
    await page.goto(paths.settingsSubscription);
    const button = page.getByRole('button', { name: 'Подключить Premium бесплатно' });
    await expect(button).toBeVisible();
    await context.setOffline(true);
    await expect(button).toBeDisabled();
    await expect(page.getByText('Для подключения Premium нужен интернет.')).toBeVisible();
    await context.setOffline(false);
    await expect(button).toBeEnabled();
  });
  test('PAY-04 повторное подключение не меняет срок и не затрагивает другой аккаунт @core', async ({
    context,
    freshClient,
    freshTrainer,
    api,
  }) => {
    await activateSubscription(api, freshClient);
    const repeated = await activateSubscription(api, freshClient);
    expect(repeated.ends_at).toBeNull();
    const other = await api.expectOk<{ is_active: boolean }>(
      'other remains free',
      api.get('/api/v1/subscriptions/status', freshTrainer.tokens),
      200,
    );
    expect(other.is_active).toBe(false);
    const page = await seedSession(context, freshClient);
    await page.goto(paths.subscriptionCheckout);
    await expect(page).toHaveURL(new RegExp(paths.settingsSubscription + '$'));
    await expect(page.getByText('Premium подключён')).toBeVisible();
  });

  test('PAY-05 ссылка приглашения записывает реферера один раз @core', async ({
    page,
    freshClient,
    api,
    runId,
  }) => {
    const before = await referralInfo(api, freshClient);
    expect(before.invited_count).toBe(0);
    const email = runEmail(runId, nextAccountLabel('referral-ui'));
    await page.goto(paths.invite.replace(':code', before.code));
    await expect(page).toHaveURL(new RegExp(`${paths.register}$`));
    await expect(page.getByRole('textbox', { name: 'Код приглашения' })).toHaveValue(before.code);
    await page.getByRole('textbox', { name: 'Имя' }).fill(`Приглашённый ${runId}`);
    await page.getByRole('textbox', { name: 'Email' }).fill(email);
    const [registered] = await Promise.all([
      page.waitForResponse(
        (r) => r.request().method() === 'POST' && r.url().endsWith('/api/v1/auth/register'),
      ),
      page.getByRole('button', { name: 'Далее' }).click(),
    ]);
    expect(registered.status()).toBe(201);
    await page.getByRole('textbox', { name: 'Код подтверждения' }).fill('000000');
    await expect(page.getByRole('heading', { name: 'Расскажите о себе' })).toBeVisible();
    await page.getByText('Мужской', { exact: true }).click();
    await page.getByLabel('Дата рождения').fill('1990-05-15');
    await page.getByLabel('Вес, кг').fill('80');
    await page.getByLabel('Рост, см').fill('180');
    await page.getByRole('button', { name: 'Завершить' }).click();
    await expect(page).toHaveURL(new RegExp(`${paths.home}$`));
    await expect.poll(async () => (await referralInfo(api, freshClient)).invited_count).toBe(1);
    expect((await referralInfo(api, freshClient)).active_count).toBe(1);
    // Повторное открытие ссылки уже зарегистрированным пользователем не создаёт вторую связь.
    await page.goto(paths.invite.replace(':code', before.code));
    await expect(page).toHaveURL(new RegExp(`${paths.home}$`));
    expect((await referralInfo(api, freshClient)).invited_count).toBe(1);
  });

  test('PAY-06 статистика рефералов отделена от чужого аккаунта @core', async ({
    browser,
    freshClient,
    freshTrainer,
    api,
    runId,
  }) => {
    const before = await referralInfo(api, freshClient);
    const otherBefore = await referralInfo(api, freshTrainer);
    expect(before.invited_count).toBe(0);
    expect(otherBefore.invited_count).toBe(0);
    await registerInvitedClient(api, runId, before.code);
    const after = await referralInfo(api, freshClient);
    expect(after).toMatchObject({ invited_count: 1, active_count: 1, earned_days: 7 });
    const baseURL = process.env.E2E_BASE_URL ?? 'http://frontend-e2e:5173';
    const ownerContext = await browser.newContext({ baseURL });
    const strangerContext = await browser.newContext({ baseURL });
    try {
      const owner = await seedSession(ownerContext, freshClient);
      await owner.goto(paths.settingsReferral);
      await expect(owner.getByText(after.code, { exact: true })).toBeVisible();
      await expect(owner.getByText(after.link, { exact: true })).toBeVisible();
      await expect(owner.getByText('1', { exact: true })).toHaveCount(2);
      await expect(owner.getByText('7', { exact: true })).toBeVisible();
      const stranger = await seedSession(strangerContext, freshTrainer);
      await stranger.goto(paths.settingsReferral);
      await expect(stranger.getByText(otherBefore.code, { exact: true })).toBeVisible();
      await expect(stranger.getByText(after.code, { exact: true })).toHaveCount(0);
      await expect(stranger.getByText('0', { exact: true })).toHaveCount(3);
      expect((await referralInfo(api, freshTrainer)).invited_count).toBe(0);
    } finally {
      await ownerContext.close();
      await strangerContext.close();
    }
  });
});
