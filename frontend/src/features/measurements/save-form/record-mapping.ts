import { BASE_FIELDS, EXTRA_FIELDS } from '@/entities/measurement/model/fields';
import type { PhotoKind } from '@/entities/measurement/model/fields';
import type { MeasurementFormValues } from '@/entities/measurement/model/schema';
import { localDateKey } from '@/shared/lib/time/localDateKey';
import type { components } from '@/shared/api/schema';

type MeasurementOut = components['schemas']['MeasurementOut'];

// Локальная календарная дата, не UTC: восточнее Гринвича toISOString() отдаёт
// вчерашний день, и форма открывалась предзаполненной вчерашней датой.
export function today(): string {
  return localDateKey();
}

/**
 * Серверная запись → значения формы (включая пользовательские поля).
 *
 * Незаполненные поля отдаются ПУСТОЙ СТРОКОЙ, а не `undefined`: значения отсюда
 * уходят в `reset()` при смене даты, а react-hook-form пропускает ключи со
 * значением `undefined` — инпут оставался с числом от предыдущей даты. Пустая
 * строка очищает поле, а схема преобразует её в `undefined` перед отправкой.
 */
export function recordToValues(record: MeasurementOut): MeasurementFormValues & { id: string } {
  const out = { id: record.id, date: record.date } as Record<string, unknown>;
  for (const field of [...BASE_FIELDS, ...EXTRA_FIELDS]) {
    out[field] = (record as unknown as Record<string, number | null | undefined>)[field] ?? '';
  }
  out.custom_values = record.custom_values ?? [];
  return out as unknown as MeasurementFormValues & { id: string };
}

/** Пустые значения формы за дату, за которую записи нет. */
export function emptyValues(date: string): MeasurementFormValues & { id: string } {
  const out = { date } as Record<string, unknown>;
  for (const field of [...BASE_FIELDS, ...EXTRA_FIELDS]) out[field] = '';
  out.custom_values = [];
  return out as unknown as MeasurementFormValues & { id: string };
}

export function photosOf(record: MeasurementOut | undefined): { kind: PhotoKind; url: string }[] {
  return (record?.photos ?? []).map((p) => ({ kind: p.kind as PhotoKind, url: p.url }));
}

export { unitFor } from '@/entities/measurement/model/summary';
