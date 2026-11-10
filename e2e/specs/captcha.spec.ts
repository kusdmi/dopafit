import { DEMO_PASSWORD, DEMO_TRAINER_EMAIL } from '../fixtures/accounts.ts';
import { expect, test } from '../fixtures/test.ts';
import { paths } from '../support/paths.ts';

// Fake only the external widget and the public enablement config. Auth requests
// still reach the isolated real API; server verification is covered by backend tests.
const widgetScript = `(() => {
  let sequence = 0;
  const widgets = new Map();
  window.smartCaptcha = {
    render(container, params) {
      if (!params.invisible) throw new Error('Expected invisible CAPTCHA');
      const id = ++sequence;
      widgets.set(id, { container, handlers: new Map(), dialog: null });
      return id;
    },
    execute(id) {
      const widget = widgets.get(id);
      if (!widget) return;
      document.documentElement.dataset.captchaExecutions = String(id);
      if (document.documentElement.dataset.captchaMode === 'silent') {
        queueMicrotask(() => widget.handlers.get('success')?.('e2e-smart-token-' + id));
        return;
      }
      const dialog = document.createElement('div');
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-label', 'Задание SmartCaptcha');
      dialog.style.cssText = 'position:fixed;top:20%;left:16px;right:16px;padding:20px;background:var(--card);color:var(--content);z-index:10000';
      const success = document.createElement('button');
      success.type = 'button';
      success.textContent = 'Пройти проверку';
      success.onclick = () => {
        widget.handlers.get('challenge-hidden')?.();
        widget.handlers.get('success')?.('e2e-smart-token-' + id);
        dialog.remove();
      };
      const close = document.createElement('button');
      close.type = 'button';
      close.textContent = 'Закрыть задание';
      close.onclick = () => {
        widget.handlers.get('challenge-hidden')?.();
        dialog.remove();
      };
      dialog.append(success, close);
      widget.dialog = dialog;
      document.body.appendChild(dialog);
      widget.handlers.get('challenge-visible')?.();
    },
    subscribe(id, event, callback) {
      widgets.get(id).handlers.set(event, callback);
      return () => widgets.get(id)?.handlers.delete(event);
    },
    destroy(id) {
      widgets.get(id)?.dialog?.remove();
      widgets.get(id)?.container.replaceChildren();
      widgets.delete(id);
    },
    setTheme() {},
  };
  window.__onSmartCaptchaReady?.();
})();`;

for (const theme of ['light', 'dark'] as const) {
  test(`AUTH-13 капча перед входом по паролю, отмена и повторная попытка (${theme}) @core @narrow`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.route('**/api/v1/auth/captcha-config', (route) =>
      route.fulfill({ json: { site_key: 'e2e-public-key' } }),
    );
    let scriptAttempts = 0;
    await page.route('https://smartcaptcha.cloud.yandex.ru/captcha.js?*', (route) => {
      scriptAttempts++;
      return scriptAttempts === 1
        ? route.abort()
        : route.fulfill({ contentType: 'application/javascript', body: widgetScript });
    });
    let loginRequests = 0;
    page.on('request', (request) => {
      if (request.url().endsWith('/api/v1/auth/login') && request.method() === 'POST')
        loginRequests++;
    });
    await page.goto(paths.login);
    await page.getByRole('button', { name: 'Войти по паролю' }).click();
    await page.getByRole('textbox', { name: 'Email' }).fill(DEMO_TRAINER_EMAIL);
    await page.getByRole('textbox', { name: 'Пароль' }).fill(DEMO_PASSWORD);
    await page.getByRole('button', { name: 'Войти', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Проверка безопасности' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('alert')).toContainText('Не удалось загрузить проверку');
    expect(loginRequests).toBe(0);
    await dialog.getByRole('button', { name: 'Повторить проверку' }).click();
    await expect(dialog).toBeHidden();
    const challenge = page.getByRole('dialog', { name: 'Задание SmartCaptcha' });
    await expect(challenge).toBeVisible();
    const box = await challenge.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(320);
    await challenge.getByRole('button', { name: 'Закрыть задание' }).click();
    await expect(dialog).toBeHidden();
    expect(loginRequests).toBe(0);
    await expect(page.getByRole('textbox', { name: 'Email' })).toHaveValue(DEMO_TRAINER_EMAIL);
    await page.getByRole('button', { name: 'Войти', exact: true }).click();
    await expect(challenge).toBeVisible();
    await expect(dialog).toBeHidden();
    const login = page.waitForRequest(
      (request) => request.url().endsWith('/api/v1/auth/login') && request.method() === 'POST',
    );
    await challenge.getByRole('button', { name: 'Пройти проверку' }).click();
    expect((await login).postDataJSON().captcha_token).toMatch(/^e2e-smart-token-/);
    await expect(page).toHaveURL(new RegExp(`${paths.home}$`));
    await page.reload();
    await expect(page.getByRole('navigation', { name: 'Основная навигация' })).toBeVisible();
  });
}

for (const mode of ['password', 'code'] as const) {
  test(`AUTH-13 невидимая капча пропускает ${mode} без модалки @core @narrow`, async ({
    page,
    freshClient,
  }) => {
    await page.route('**/api/v1/auth/captcha-config', (route) =>
      route.fulfill({ json: { site_key: 'e2e-public-key' } }),
    );
    await page.route('https://smartcaptcha.cloud.yandex.ru/captcha.js?*', (route) =>
      route.fulfill({ contentType: 'application/javascript', body: widgetScript }),
    );
    await page.goto(paths.login);
    await page.evaluate(() => {
      document.documentElement.dataset.captchaMode = 'silent';
    });
    if (mode === 'password') await page.getByRole('button', { name: 'Войти по паролю' }).click();
    await page
      .getByRole('textbox', { name: 'Email' })
      .fill(mode === 'code' ? freshClient.user.email! : DEMO_TRAINER_EMAIL);
    if (mode === 'password')
      await page.getByRole('textbox', { name: 'Пароль' }).fill(DEMO_PASSWORD);
    const endpoint = mode === 'password' ? '/api/v1/auth/login' : '/api/v1/auth/login/request-code';
    const request = page.waitForRequest((r) => r.url().endsWith(endpoint) && r.method() === 'POST');
    await page
      .getByRole('button', { name: mode === 'password' ? 'Войти' : 'Получить код', exact: true })
      .click();
    expect((await request).postDataJSON().captcha_token).toMatch(/^e2e-smart-token-/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Я не робот' })).toHaveCount(0);
    if (mode === 'code') {
      await expect(page.getByRole('heading', { name: 'Введите код' })).toBeVisible();
      await page.getByRole('textbox', { name: 'Код подтверждения' }).fill('000000');
    }
    await expect(page).toHaveURL(new RegExp(`${paths.home}$`));
  });
}
