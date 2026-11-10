/**
 * Универсальное (для всех стран) форматирование телефона. Без сторонних
 * библиотек: показываем «код страны + 3-3-2-2» (как привычно в большинстве
 * стран), а в форму/API кладём чистый E.164 (см. toE164).
 */

/** Нормализовать произвольный ввод в E.164-подобный вид: ведущий «+» и только
 *  цифры. Используется как ЗНАЧЕНИЕ формы (валидно для zod ^\+\d{10,15}$) и как
 *  то, что уходит на backend. Пустой ввод → пустая строка.
 *
 *  Особый случай RU/KZ: ведущий «8» в 11-значном номере — местный префикс выхода
 *  на межгород, а не код страны (зоны «8» в E.164 нет). Нормализуем 8XXXXXXXXXX →
 *  +7XXXXXXXXXX, иначе на backend уехал бы невалидный «+8…». «+8…» вводить
 *  напрямую нельзя — на это указывает только голая «8» без ведущего «+». */
export function toE164(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (!raw.trim().startsWith('+') && digits.length === 11 && digits.startsWith('8')) {
    digits = `7${digits.slice(1)}`;
  }
  return digits ? `+${digits}` : '';
}

// Известные коды стран длиной 1 и 2 (E.164). Всё остальное трактуем как 3-значный
// код — этого достаточно для «красивой» группировки большинства номеров без
// тяжёлой библиотеки. Зона «1» (NANP) и «7» (Россия/Казахстан) — однозначные.
const ONE_DIGIT_CODES = new Set(['1', '7']);
const TWO_DIGIT_CODES = new Set([
  '20', '27', '30', '31', '32', '33', '34', '36', '39', '40', '41', '43', '44',
  '45', '46', '47', '48', '49', '51', '52', '53', '54', '55', '56', '57', '58',
  '60', '61', '62', '63', '64', '65', '66', '81', '82', '84', '86', '90', '91',
  '92', '93', '94', '95', '98',
]);

/** Длина кода страны (1–3) по ведущим цифрам — для красивой группировки. */
function countryCodeLength(digits: string): number {
  if (ONE_DIGIT_CODES.has(digits.slice(0, 1))) return 1;
  if (TWO_DIGIT_CODES.has(digits.slice(0, 2))) return 2;
  return 3;
}

/** Отформатировать для ПОКАЗА пользователю: «+<код> 3-3-2-2…». Код страны
 *  отделяется, остаток режется на привычные группы (3, 3, затем по 2).
 *  Работает и для ручного ввода, и для autofill (форматируем любой ввод). */
export function formatPhoneIntl(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';

  const codeLen = Math.min(countryCodeLength(digits), digits.length);
  const code = digits.slice(0, codeLen);
  const rest = digits.slice(codeLen);

  const groups: string[] = [];
  let i = 0;
  // Первые две группы по 3, дальше по 2 — даёт +7 999 123 45 67 и т.п.
  for (const size of [3, 3]) {
    if (i >= rest.length) break;
    groups.push(rest.slice(i, i + size));
    i += size;
  }
  while (i < rest.length) {
    groups.push(rest.slice(i, i + 2));
    i += 2;
  }

  return `+${[code, ...groups].join(' ')}`.trimEnd();
}
