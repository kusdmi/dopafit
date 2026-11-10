/**
 * Единицы измерения для пользовательского поля замера.
 *
 * Поле заводит сам пользователь, и свободный ввод давал разнобой: «см», «См»,
 * «cm» — одна и та же единица тремя написаниями, из-за чего значения разных
 * записей переставали читаться как один ряд. Список закрывает то, что реально
 * меряют в антропометрии: обхваты и рост (см/мм), вес и его производные
 * (кг/г), доли (%) и углы подвижности (°).
 *
 * Контракт (`CustomFieldUpdateRequest`) по-прежнему принимает любую строку
 * 1..10 — ограничение только в интерфейсе. Поэтому единицу, сохранённую
 * раньше свободным вводом (или другим клиентом), модалка не затирает:
 * `unitOptions` подмешивает её к списку, иначе открытие поля молча сменило бы
 * единицу на первую из списка.
 */
export const MEASUREMENT_UNITS = ['см', 'мм', 'кг', 'г', '%', '°'] as const;

export type MeasurementUnit = (typeof MEASUREMENT_UNITS)[number];

/** Единица по умолчанию: большинство пользовательских полей — обхваты. */
export const DEFAULT_MEASUREMENT_UNIT: MeasurementUnit = 'см';

/** Список для `<select>` с сохранением незнакомой единицы, если она была. */
export function unitOptions(current?: string): string[] {
  const trimmed = current?.trim();
  if (!trimmed || (MEASUREMENT_UNITS as readonly string[]).includes(trimmed)) {
    return [...MEASUREMENT_UNITS];
  }
  return [trimmed, ...MEASUREMENT_UNITS];
}
