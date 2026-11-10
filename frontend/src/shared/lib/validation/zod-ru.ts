import { z } from 'zod';

// Global Russian error map for zod v4. Installed once via setupZodRu() at the
// app entry point so that EVERY form built on zodResolver shows Russian text by
// default. Schemas that pass an explicit `message` keep their own wording —
// zod prefers a per-issue message over the global customError, and any issue we
// don't recognise falls back to zod's default by returning undefined.

type ZodIssue = z.core.$ZodRawIssue;

const TYPE_NAMES: Record<string, string> = {
  string: 'строка',
  number: 'число',
  int: 'целое число',
  boolean: 'логическое значение',
  array: 'список',
  object: 'объект',
  date: 'дата',
  bigint: 'число',
};

function originNoun(origin: unknown): 'symbols' | 'items' | 'value' {
  if (origin === 'string') return 'symbols';
  if (origin === 'array' || origin === 'set' || origin === 'file') return 'items';
  return 'value';
}

function tooSmall(issue: Extract<ZodIssue, { code: 'too_small' }>): string {
  const min = issue.minimum as number;
  const kind = originNoun(issue.origin);
  if (kind === 'symbols') {
    if (min === 1) return 'Обязательное поле';
    return `Минимум ${min} символов`;
  }
  if (kind === 'items') {
    if (min === 1) return 'Выберите хотя бы один вариант';
    return `Минимум ${min} элементов`;
  }
  return `Минимальное значение — ${min}`;
}

function tooBig(issue: Extract<ZodIssue, { code: 'too_big' }>): string {
  const max = issue.maximum as number;
  const kind = originNoun(issue.origin);
  if (kind === 'symbols') return `Максимум ${max} символов`;
  if (kind === 'items') return `Максимум ${max} элементов`;
  return `Максимальное значение — ${max}`;
}

function invalidType(issue: Extract<ZodIssue, { code: 'invalid_type' }>): string {
  // `undefined`/`null`/`NaN` typically mean an empty required field.
  const input = (issue as { input?: unknown }).input;
  if (input === undefined || input === null || (typeof input === 'number' && Number.isNaN(input))) {
    return 'Обязательное поле';
  }
  const expected = TYPE_NAMES[issue.expected] ?? 'корректное значение';
  return `Ожидается ${expected}`;
}

function invalidFormat(issue: Extract<ZodIssue, { code: 'invalid_format' }>): string {
  switch (issue.format) {
    case 'email':
      return 'Введите корректный email';
    case 'url':
      return 'Введите корректную ссылку';
    case 'uuid':
      return 'Некорректный идентификатор';
    case 'regex':
      return 'Некорректный формат';
    default:
      return 'Некорректный формат';
  }
}

export const customRuMap: z.core.$ZodErrorMap = (issue) => {
  switch (issue.code) {
    case 'invalid_type':
      return invalidType(issue);
    case 'too_small':
      return tooSmall(issue);
    case 'too_big':
      return tooBig(issue);
    case 'invalid_format':
      return invalidFormat(issue);
    case 'invalid_value':
    case 'invalid_union':
      return 'Выберите значение из списка';
    case 'not_multiple_of':
      return 'Некорректное значение';
    case 'unrecognized_keys':
      return 'Недопустимые поля';
    case 'invalid_key':
    case 'invalid_element':
      return 'Некорректное значение';
    case 'custom':
      // Custom refinements without an explicit message — keep generic Russian.
      return 'Некорректное значение';
    default:
      // Unknown code: let zod use its own default.
      return undefined;
  }
};

let installed = false;

export function setupZodRu(): void {
  if (installed) return;
  z.config({ customError: customRuMap });
  installed = true;
}
