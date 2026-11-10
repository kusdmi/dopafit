import type { components } from '@/shared/api/schema';

import { ALL_FIELDS, FIELD_LABELS } from './fields';

type MeasurementOut = components['schemas']['MeasurementOut'];

// Figma 757:1991 etc. show the unit inside each field. Weight is the only
// kilogram field; every circumference (and height) is in centimetres. The mock
// mislabels height as "кг" — an obvious slip in the design, kept correct here.
const FIELD_UNIT: Partial<Record<string, string>> = { weight: 'кг' };

export function unitFor(field: string): string {
  return FIELD_UNIT[field] ?? 'см';
}

export interface SummaryMetric {
  key: string;
  label: string;
  unit: string;
  value: number;
}

/** Метрики, которые история показывает в строке по макету. */
const HEADLINE_FIELDS = ['weight', 'waist', 'chest'] as const;

/**
 * Что показать в свёрнутой строке истории.
 *
 * Обычно это три метрики из макета. Но замеры поддерживают дополнительные и
 * пользовательские поля, и запись может не содержать ни одной из трёх — тогда
 * строка вышла бы пустой, хотя данные есть, и это читалось бы как их потеря.
 * В таком случае показываем то, что в записи действительно есть.
 */
export function summaryMetrics(record: MeasurementOut): SummaryMetric[] {
  const values = record as unknown as Record<string, number | null | undefined>;
  const metric = (key: string): SummaryMetric | null => {
    const value = values[key];
    if (value == null) return null;
    return { key, label: FIELD_LABELS[key as keyof typeof FIELD_LABELS], unit: unitFor(key), value };
  };

  const headline = HEADLINE_FIELDS.map(metric).filter((m): m is SummaryMetric => m !== null);
  if (headline.length > 0) return headline;

  const others = ALL_FIELDS.map(metric).filter((m): m is SummaryMetric => m !== null);
  const custom = (record.custom_values ?? []).map((cv) => ({
    key: `custom-${cv.slot}`,
    label: cv.name,
    unit: cv.unit,
    value: cv.value,
  }));
  return [...others, ...custom];
}
