import { describe, expect, it } from 'vitest';

import { errorReason, errorText } from './error-reasons';

const FALLBACK = 'Запасной текст';

describe('errorReason', () => {
  it('достаёт признак из details', () => {
    expect(errorReason({ code: 'conflict', message: 'x', details: { reason: 'email_taken' } })).toBe(
      'email_taken',
    );
  });

  it('возвращает null, когда details нет или он не того вида', () => {
    for (const error of [
      { code: 'conflict', message: 'x' },
      { code: 'conflict', message: 'x', details: null },
      { code: 'conflict', message: 'x', details: 'строка' },
      { code: 'conflict', message: 'x', details: { reason: 42 } },
    ]) {
      expect(errorReason(error)).toBeNull();
    }
  });
});

describe('errorText', () => {
  it('переводит занятый email и занятый телефон по-разному', () => {
    // Ради этого признак и нужен: один code «conflict» их не различал.
    const email = errorText(
      { code: 'conflict', message: 'User with this email already exists', details: { reason: 'email_taken' } },
      FALLBACK,
    );
    const phone = errorText(
      { code: 'conflict', message: 'User with this phone or email already exists', details: { reason: 'phone_taken' } },
      FALLBACK,
    );
    expect(email).toBe('Этот email уже зарегистрирован');
    expect(phone).toBe('Этот телефон уже зарегистрирован');
    expect(email).not.toBe(phone);
  });

  it('НЕ показывает английский текст сервера при известном признаке', () => {
    const text = errorText(
      { code: 'conflict', message: 'User with this email already exists', details: { reason: 'email_taken' } },
      FALLBACK,
    );
    expect(text).not.toMatch(/already exists/);
  });

  it('падает на запасной текст без признака — не пусто и не undefined', () => {
    // Старая сборка сервера или сценарий, до которого перевод не дошёл.
    expect(errorText({ code: 'conflict', message: 'User already exists' }, FALLBACK)).toBe(FALLBACK);
  });

  it('падает на запасной текст при НЕЗНАКОМОМ признаке', () => {
    // Новый reason на сервере не должен ломать экран.
    expect(
      errorText({ code: 'conflict', message: 'nope', details: { reason: 'something_new' } }, FALLBACK),
    ).toBe(FALLBACK);
  });

  it('переживает сетевую ошибку (не ApiError) и отдаёт запасной текст', () => {
    expect(errorText(new Error('boom'), FALLBACK)).toBe(FALLBACK);
  });
});
