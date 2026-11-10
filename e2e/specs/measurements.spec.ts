import type { Page } from '@playwright/test';

import { seedSession } from '../fixtures/accounts.ts';
import { createMeasurement } from '../fixtures/data.ts';
import { testPhoto, uploadPhoto } from '../fixtures/photos.ts';
import { expect, test } from '../fixtures/test.ts';
import { paths } from '../support/paths.ts';

interface Measurement {
  id: string;
  date: string;
  weight: number | null;
  waist: number | null;
  photos: { kind: string; url: string }[];
}

interface MeasurementList {
  items: Measurement[];
  total: number;
}

const MONTHS = [
  'янв.',
  'фев.',
  'мар.',
  'апр.',
  'мая',
  'июн.',
  'июл.',
  'авг.',
  'сен.',
  'окт.',
  'ноя.',
  'дек.',
];

function dateFromToday(offset: number): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = (part: string) => Number(parts.find((item) => item.type === part)?.value);
  const date = new Date(Date.UTC(value('year'), value('month') - 1, value('day') + offset));
  return date.toISOString().slice(0, 10);
}

function fullDate(date: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
    .format(new Date(date))
    .replace(' г.', '');
}

function historyName(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return `Замер за ${day} ${MONTHS[month - 1]} ${year}`;
}

async function measurements(
  api: import('../fixtures/api.ts').Api,
  tokens: import('../fixtures/api.ts').TokenPair,
) {
  return api.expectOk<MeasurementList>(
    'list measurements',
    api.get('/api/v1/measurements', tokens),
    200,
  );
}

async function openAnthropometry(page: Page): Promise<void> {
  await page.goto(paths.analytics);
  await page.getByRole('tab', { name: 'Антропометрия' }).click();
  await expect(page.getByRole('heading', { name: 'График измерений' })).toBeVisible();
}

/** Раздел F: UI-запись сверяется с сервером и повторным открытием, чтобы оптимистичный кэш не был единственным оракулом. */
test.describe('F. Замеры и аналитика клиента', () => {
  test('MEAS-01 создание замера видно в истории и графике после reload @smoke', async ({
    context,
    freshClient,
    api,
  }) => {
    const date = dateFromToday(-4);
    const page = await seedSession(context, freshClient);
    await page.goto(paths.measurements);
    await page.getByLabel('Дата').fill(date);
    await page.getByLabel('Вес').fill('10000');
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(page.getByText('Максимум 9999,9', { exact: true })).toBeVisible();
    await page.getByLabel('Вес').fill('73.5');
    await page.getByLabel('Талия').fill('79');
    const [created] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' && response.url().endsWith('/api/v1/measurements'),
      ),
      page.getByRole('button', { name: 'Сохранить', exact: true }).click(),
    ]);
    expect(created.status()).toBe(201);
    await page.reload();
    await page.getByRole('button', { name: historyName(date) }).click();
    const detail = page.getByRole('dialog');
    await expect(detail.getByText('73.5 кг')).toBeVisible();
    await expect(detail.getByText('79 см')).toBeVisible();
    const saved = (await measurements(api, freshClient.tokens)).items.find(
      (item) => item.date === date,
    );
    expect(saved).toMatchObject({ weight: 73.5, waist: 79 });
    await openAnthropometry(page);
    await expect(page.getByText('73.5', { exact: true }).first()).toBeVisible();
  });

  test('MEAS-02 правка замера сохраняет дату и новые значения в аналитике @core', async ({
    context,
    freshClient,
    measurementFixture,
    api,
  }) => {
    const page = await seedSession(context, freshClient);
    await page.goto(paths.measurements);
    await page.getByRole('button', { name: historyName(measurementFixture.date) }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Загрузить для редактирования' })
      .click();
    await expect(page.getByLabel('Дата')).toHaveValue(measurementFixture.date);
    await page.getByLabel('Вес').fill('-1');
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(
      page.getByText('Значение не может быть отрицательным', { exact: true }),
    ).toBeVisible();
    expect(
      (await measurements(api, freshClient.tokens)).items.find(
        (item) => item.id === measurementFixture.measurementId,
      )?.weight,
    ).toBe(measurementFixture.weight);
    await page.getByLabel('Вес').fill('76.2');
    await page.getByLabel('Талия').fill('81');
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Изменения замера' })).toBeVisible();
    await expect(dialog.getByText('78.5')).toBeVisible();
    const [updated] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === 'PUT' &&
          response.url().endsWith(`/api/v1/measurements/${measurementFixture.measurementId}`),
      ),
      dialog.getByRole('button', { name: 'Подтвердить' }).click(),
    ]);
    expect(updated.status()).toBe(200);
    await page.reload();
    await page.getByRole('button', { name: historyName(measurementFixture.date) }).click();
    await expect(page.getByRole('dialog').getByText('76.2 кг')).toBeVisible();
    const list = await measurements(api, freshClient.tokens);
    expect(list.items.filter((item) => item.date === measurementFixture.date)).toHaveLength(1);
    expect(list.items.find((item) => item.date === measurementFixture.date)).toMatchObject({
      weight: 76.2,
      waist: 81,
    });
    await openAnthropometry(page);
    await expect(page.getByText('76.2', { exact: true }).first()).toBeVisible();
  });

  test('MEAS-03 повторная дата требует подтверждения без потери прежнего результата @core', async ({
    context,
    freshClient,
    measurementFixture,
    api,
  }) => {
    const page = await seedSession(context, freshClient);
    await page.goto(paths.measurements);
    await page.getByLabel('Дата').fill(measurementFixture.date);
    await expect(page.getByLabel('Вес')).toHaveValue('78.5');
    await page.getByLabel('Вес').fill('77');
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Изменения замера' })).toBeVisible();
    await expect(dialog.getByText('78.5')).toBeVisible();
    await dialog.getByRole('button', { name: 'Отмена' }).click();
    expect(
      (await measurements(api, freshClient.tokens)).items.find(
        (item) => item.date === measurementFixture.date,
      )?.weight,
    ).toBe(78.5);
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    const [updated] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === 'PUT' &&
          response.url().endsWith(`/api/v1/measurements/${measurementFixture.measurementId}`),
      ),
      dialog.getByRole('button', { name: 'Подтвердить' }).click(),
    ]);
    expect(updated.status()).toBe(200);
    await page.reload();
    const list = await measurements(api, freshClient.tokens);
    expect(list.items.filter((item) => item.date === measurementFixture.date)).toHaveLength(1);
    expect(list.items.find((item) => item.date === measurementFixture.date)?.weight).toBe(77);
  });

  test('MEAS-04 перенос даты сохраняет заполненные поля и перестраивает историю @core', async ({
    context,
    freshClient,
    measurementFixture,
    api,
  }) => {
    const newDate = dateFromToday(-6);
    const page = await seedSession(context, freshClient);
    await page.goto(paths.measurements);
    await page.getByRole('button', { name: historyName(measurementFixture.date) }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Загрузить для редактирования' })
      .click();
    await page.getByLabel('Дата').fill(newDate);
    // Перенос меняет дату записи, поэтому прежние значения не должны исчезнуть из формы.
    await expect(page.getByLabel('Вес')).toHaveValue(String(measurementFixture.weight));
    const [updated] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === 'PUT' &&
          response.url().endsWith(`/api/v1/measurements/${measurementFixture.measurementId}`),
      ),
      page.getByRole('button', { name: 'Сохранить', exact: true }).click(),
    ]);
    expect(updated.status()).toBe(200);
    await expect(page.getByRole('button', { name: historyName(newDate) })).toBeVisible();
    await page.reload();
    const list = await measurements(api, freshClient.tokens);
    expect(
      list.items.some(
        (item) => item.id === measurementFixture.measurementId && item.date === newDate,
      ),
    ).toBe(true);
    await expect(page.getByRole('button', { name: historyName(newDate) })).toBeVisible();
    await expect(
      page.getByRole('button', { name: historyName(measurementFixture.date) }),
    ).toHaveCount(0);
  });

  test('MEAS-05 фото сохраняется после reload и доступно в сравнении дат @core', async ({
    context,
    freshClient,
    measurementFixture,
    api,
  }) => {
    const other = await createMeasurement(api, freshClient, {
      date: dateFromToday(-5),
      weight: 77,
    });
    await uploadPhoto(freshClient, other.measurementId, 'front');
    const page = await seedSession(context, freshClient);
    await page.goto(paths.measurements);
    await page.getByRole('button', { name: historyName(measurementFixture.date) }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Загрузить для редактирования' })
      .click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Выбрать фото: Спереди' }).click();
    await (await chooser).setFiles(testPhoto());
    await expect(page.getByRole('button', { name: 'Удалить фото: Спереди' })).toBeVisible();
    const uploaded = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().endsWith(`/api/v1/measurements/${measurementFixture.measurementId}/photos`),
    );
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    expect((await uploaded).status()).toBe(201);
    await expect
      .poll(async () =>
        (await measurements(api, freshClient.tokens)).items
          .find((item) => item.id === measurementFixture.measurementId)
          ?.photos.some((photo) => photo.kind === 'front'),
      )
      .toBe(true);
    await page.reload();
    await page.getByRole('button', { name: historyName(measurementFixture.date) }).click();
    await expect(page.getByRole('dialog').getByRole('img', { name: 'Спереди' })).toBeVisible();
    await openAnthropometry(page);
    await page.getByLabel('Было').selectOption(other.date);
    await page.getByLabel('Стало').selectOption(measurementFixture.date);
    await expect(page.getByRole('img', { name: `Фото ${fullDate(other.date)}` })).toBeVisible();
    await expect(
      page.getByRole('img', { name: `Фото ${fullDate(measurementFixture.date)}` }),
    ).toBeVisible();
  });

  test('MEAS-06 отклонённое фото сразу исчезает с понятной причиной @core', async ({
    context,
    freshClient,
    measurementFixture,
  }) => {
    const page = await seedSession(context, freshClient);
    await page.goto(paths.measurements);
    await page.getByRole('button', { name: historyName(measurementFixture.date) }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Загрузить для редактирования' })
      .click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Выбрать фото: Спереди' }).click();
    await (
      await chooser
    ).setFiles({
      name: 'invalid.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('not an image'),
    });
    await expect(page.getByRole('button', { name: 'Удалить фото: Спереди' })).toBeVisible();
    const [rejected] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          response
            .url()
            .endsWith(`/api/v1/measurements/${measurementFixture.measurementId}/photos`),
      ),
      page.getByRole('button', { name: 'Сохранить', exact: true }).click(),
    ]);
    expect(rejected.status()).toBe(422);
    await expect(
      page.getByRole('alert').filter({ hasText: /формат|изображени|фото/i }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Удалить фото: Спереди' })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Удалить фото: Спереди' })).toHaveCount(0);
  });

  test('MEAS-07 удаление одного фото сохраняет второе и числовой замер @core', async ({
    context,
    freshClient,
    measurementFixture,
    api,
  }) => {
    await uploadPhoto(freshClient, measurementFixture.measurementId, 'front');
    await uploadPhoto(freshClient, measurementFixture.measurementId, 'back');
    const page = await seedSession(context, freshClient);
    await page.goto(paths.measurements);
    await page.getByRole('button', { name: historyName(measurementFixture.date) }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Загрузить для редактирования' })
      .click();
    await expect(page.getByRole('button', { name: 'Удалить фото: Спереди' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Удалить фото: Сзади' })).toBeVisible();
    await page.getByRole('button', { name: 'Удалить фото: Спереди' }).click();
    const [removed] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === 'DELETE' &&
          response
            .url()
            .endsWith(`/api/v1/measurements/${measurementFixture.measurementId}/photos/front`),
      ),
      page.getByRole('dialog').getByRole('button', { name: 'Удалить' }).click(),
    ]);
    expect(removed.status()).toBe(204);
    const saved = (await measurements(api, freshClient.tokens)).items.find(
      (item) => item.id === measurementFixture.measurementId,
    );
    expect(saved?.photos.map((photo) => photo.kind)).toEqual(['back']);
    await page.reload();
    await page.getByRole('button', { name: historyName(measurementFixture.date) }).click();
    const detail = page.getByRole('dialog');
    await expect(detail.getByRole('img', { name: 'Спереди' })).toHaveCount(0);
    await expect(detail.getByRole('img', { name: 'Сзади' })).toBeVisible();
    await expect(detail.getByText('78.5 кг')).toBeVisible();
    expect(saved?.weight).toBe(measurementFixture.weight);
  });

  test('MEAS-08 удаление замера обновляет историю и график @core', async ({
    context,
    freshClient,
    measurementFixture,
    api,
  }) => {
    const page = await seedSession(context, freshClient);
    await page.goto(paths.measurements);
    await page.getByRole('button', { name: historyName(measurementFixture.date) }).click();
    const remove = page.getByRole('dialog').getByRole('button', { name: 'Удалить замер' });
    await expect(remove).toBeVisible();
    await remove.click();
    const deleted = page.waitForResponse(
      (response) =>
        response.request().method() === 'DELETE' &&
        response.url().endsWith(`/api/v1/measurements/${measurementFixture.measurementId}`),
    );
    await page.getByRole('dialog').getByRole('button', { name: 'Удалить' }).click();
    expect((await deleted).status()).toBe(204);
    await expect(
      page.getByRole('button', { name: historyName(measurementFixture.date) }),
    ).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByRole('button', { name: historyName(measurementFixture.date) }),
    ).toHaveCount(0);
    expect(
      (await measurements(api, freshClient.tokens)).items.some(
        (item) => item.id === measurementFixture.measurementId,
      ),
    ).toBe(false);
    await openAnthropometry(page);
    await expect(page.getByText('78.5', { exact: true })).toHaveCount(0);
  });

  test('MEAS-09 период и метрика показывают нужные точки и пустой интервал @core', async ({
    context,
    freshClient,
    api,
  }) => {
    const first = await createMeasurement(api, freshClient, {
      date: dateFromToday(-8),
      weight: 70,
      waist: 75,
    });
    const second = await createMeasurement(api, freshClient, {
      date: dateFromToday(-7),
      weight: 72,
      waist: 77,
    });
    const page = await seedSession(context, freshClient);
    await openAnthropometry(page);
    await page.getByLabel('Период анализа: начало').fill(first.date);
    await page.getByLabel('Период анализа: конец').fill(second.date);
    await expect(page.getByRole('button', { name: 'Вес' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('70', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('72', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Талия' }).click();
    await expect(page.getByRole('button', { name: 'Талия' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByText('75', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('77', { exact: true }).first()).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Талия' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByLabel('Период анализа: начало').fill(dateFromToday(-30));
    await page.getByLabel('Период анализа: конец').fill(dateFromToday(-29));
    await expect(page.getByText('Данные отсутствуют')).toBeVisible();
  });

  test('MEAS-10 на 320 px поля и график не перекрываются в обеих темах @narrow', async ({
    context,
    freshClient,
    measurementFixture,
  }) => {
    const page = await seedSession(context, freshClient);
    for (const [label, theme] of [
      ['Светлая', 'light'],
      ['Тёмная', 'dark'],
    ] as const) {
      await page.goto(paths.settingsTheme);
      await page.getByRole('button', { name: new RegExp(`^${label}`) }).click();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.getAttribute('data-theme')))
        .toBe(theme);
      await page.goto(paths.measurements);
      await expect(page.getByLabel('Вес')).toBeVisible();
      await expect(
        page.getByRole('button', { name: historyName(measurementFixture.date) }),
      ).toBeVisible();
      await openAnthropometry(page);
      const start = await page.getByLabel('Период анализа: начало').boundingBox();
      const end = await page.getByLabel('Период анализа: конец').boundingBox();
      const before = await page.getByLabel('Было').boundingBox();
      const after = await page.getByLabel('Стало').boundingBox();
      expect(
        start && end && (start.x + start.width <= end.x || start.y + start.height <= end.y),
      ).toBeTruthy();
      expect(
        before &&
          after &&
          (before.x + before.width <= after.x || before.y + before.height <= after.y),
      ).toBeTruthy();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        320,
      );
      await expect(
        page.getByRole('heading', { name: 'Сравнение фотографий прогресса' }),
      ).toBeVisible();
    }
  });
});
