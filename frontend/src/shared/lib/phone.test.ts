import { describe, expect, it } from 'vitest';

import { formatPhoneIntl, toE164 } from './phone';

describe('toE164', () => {
  it('оставляет ведущий + и только цифры', () => {
    expect(toE164('+7 999 123 45 67')).toBe('+79991234567');
  });

  it('нормализует ведущую 8 (RU/KZ местный префикс) в +7', () => {
    expect(toE164('8 (999) 000-00-00')).toBe('+79990000000');
    // ведущий «+» означает явный код страны — 8 НЕ трогаем
    expect(toE164('+8 999 000 00 00')).toBe('+89990000000');
    // не 11 цифр — это не RU-номер с префиксом 8, оставляем как есть
    expect(toE164('8 800 555')).toBe('+8800555');
  });

  it('пустой ввод → пустая строка', () => {
    expect(toE164('')).toBe('');
    expect(toE164('  ')).toBe('');
  });

  it('убирает лишние плюсы и буквы (autofill вставляет разное)', () => {
    expect(toE164('++44 20 7946 0958')).toBe('+442079460958');
    expect(toE164('tel:+1-202-555-0100')).toBe('+12025550100');
  });
});

describe('formatPhoneIntl', () => {
  it('код страны + 3-3-2-2 (универсально, красиво)', () => {
    // однозначные коды зон 7 и 1
    expect(formatPhoneIntl('79991234567')).toBe('+7 999 123 45 67');
    expect(formatPhoneIntl('12025550100')).toBe('+1 202 555 01 00');
    // двузначный код 44
    expect(formatPhoneIntl('+442079460958')).toBe('+44 207 946 09 58');
    // трёхзначный код 380, остаток режется 3-3-2-2
    expect(formatPhoneIntl('380501234567')).toBe('+380 501 234 56 7');
  });

  it('форматирует частичный ввод по мере набора', () => {
    expect(formatPhoneIntl('7')).toBe('+7');
    expect(formatPhoneIntl('+79')).toBe('+7 9');
    expect(formatPhoneIntl('7999')).toBe('+7 999');
    expect(formatPhoneIntl('799912')).toBe('+7 999 12');
  });

  it('пустой ввод → пустая строка (placeholder остаётся)', () => {
    expect(formatPhoneIntl('')).toBe('');
    expect(formatPhoneIntl('+')).toBe('');
  });
});
