import { seedSession } from '../fixtures/accounts.ts';
import { expect, test } from '../fixtures/test.ts';
import { paths } from '../support/paths.ts';

test('UI-09 локальный контур не отправляет Метрику, личный контент закрыт от Вебвизора @core', async ({
  context,
  freshClient,
}) => {
  const requests: string[] = [];
  await context.route('https://mc.yandex.ru/**', async (route) => {
    requests.push(route.request().url());
    await route.abort();
  });
  const page = await seedSession(context, freshClient);
  for (const [path, heading] of [
    [paths.home, 'Календарь'],
    [paths.measurements, 'Данные антропометрии'],
    [paths.settings, 'Настройки'],
  ]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    expect(
      await page
        .getByRole('main')
        .evaluate(() => document.body.classList.contains('ym-hide-content')),
    ).toBe(true);
    expect(
      await page.evaluate(() =>
        Array.from(document.scripts).some((script) =>
          script.src.startsWith('https://mc.yandex.ru/'),
        ),
      ),
    ).toBe(false);
  }
  await page.getByRole('button', { name: 'Выйти' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.getByRole('dialog').evaluate((node) => document.body.contains(node))).toBe(
    true,
  );
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Настройки' })).toBeVisible();
  expect(requests).toEqual([]);
});
