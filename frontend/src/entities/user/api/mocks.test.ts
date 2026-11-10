import { describe, expect, it } from 'vitest';

import { env } from '@/shared/config/env';

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${env.apiUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Онбординг принимает дату рождения и пишет её в профиль как есть. Раньше он брал
 * целое `age`, а бэкенд выводил из него `${текущий_год - age}-01-01`, теряя день и
 * месяц. Мок повторяет и требование поля, и точную запись — иначе форма могла бы
 * перестать слать дату, а флоу-тесты остались бы зелёными.
 */
describe('onboarding mock takes a birth date', () => {
  it('сохраняет присланную дату рождения без изменений', async () => {
    const response = await post('/api/v1/users/me/onboarding', {
      gender: 'female',
      birth_date: '1990-04-17',
      weight: 70,
      height: 175,
      clients_per_month: null,
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.profile.birth_date).toBe('1990-04-17');
    expect(body.profile.gender).toBe('female');
  });

  it('отклоняет онбординг без даты рождения', async () => {
    const response = await post('/api/v1/users/me/onboarding', {
      gender: 'male',
      weight: 80,
      height: 180,
      clients_per_month: null,
    });

    expect(response.status).toBe(422);
    expect((await response.json()).code).toBe('validation_error');
  });
});
