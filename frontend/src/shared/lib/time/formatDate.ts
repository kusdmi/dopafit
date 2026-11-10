import { localDateKey } from './localDateKey';

/** Formats dates for compact input controls as dd.mm.yyyy. */
export function formatDateNumeric(iso: string): string {
  // Берём только дату-часть, парсим без таймзонных сюрпризов.
  const datePart = iso.slice(0, 10);
  const [y, m, d] = datePart.split('-');
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

const MONTHS_SHORT = [
  'янв',
  'фев',
  'мар',
  'апр',
  'май',
  'июн',
  'июл',
  'авг',
  'сен',
  'окт',
  'ноя',
  'дек',
];

/** Форматирует ISO-дату в короткий русский вид, напр. '1 мар' (день + сокр. месяц). */
export function formatDateShort(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS_SHORT[(m ?? 1) - 1]}`;
}

const MONTHS_FULL = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

/**
 * Полная дата прописью: '23 января 2026'.
 *
 * Отдельно от formatHistoryDate: тот подменяет близкие даты на
 * «Сегодня»/«Вчера» и опускает год внутри текущего — для заголовка истории это
 * верно, а для заголовка карточки замера («Запись за 23 января 2026», макет
 * 758:2726) нужна именно дата, всегда с годом и без относительных слов.
 */
export function formatDateFull(iso: string): string {
  const day = localDayFromIso(iso);
  return `${day.getDate()} ${MONTHS_FULL[day.getMonth()]} ${day.getFullYear()}`;
}

/** Локальная дата (без времени/таймзоны) для дня iso-строки. */
function localDayFromIso(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** Кол-во полных календарных дней между двумя локальными датами (b - a). */
function dayDiff(a: Date, b: Date): number {
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((db.getTime() - da.getTime()) / 86_400_000);
}

/**
 * Форматирует дату для заголовка дня в истории тренировки.
 * - 'Сегодня' / 'Вчера' для близких дат (по локальной дате пользователя)
 * - '1 марта' если это текущий год
 * - '1 марта 2025' для прошлых лет
 * `now` инжектируется для детерминированных тестов.
 */
export function formatHistoryDate(iso: string, now: Date = new Date()): string {
  const day = localDayFromIso(iso);
  const diff = dayDiff(day, now);
  if (diff === 0) return 'Сегодня';
  if (diff === 1) return 'Вчера';
  const label = `${day.getDate()} ${MONTHS_FULL[day.getMonth()]}`;
  return day.getFullYear() === now.getFullYear() ? label : `${label} ${day.getFullYear()}`;
}

/** Shared long date for user-facing text. */
export const formatDate = formatDateFull;

/** Timestamps use the user's local calendar day and omit seconds. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  const localDay = localDateKey(date);
  const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return `${formatDateFull(localDay)}, ${time}`;
}
