import { toApiError } from '@/shared/api/client';
import { FIELD_LABELS } from './fields';

export function measurementError(error: unknown): string {
  const e = toApiError(error);
  if (e.code === 'measurement_date_conflict')
    return 'На эту дату уже есть замер. Выберите другую дату.';
  if (e.code !== 'validation_error')
    return 'Не удалось сохранить замер. Введённые данные остаются в форме.';
  const messages = (Array.isArray(e.details) ? e.details : []).flatMap((issue: unknown) => {
    if (!issue || typeof issue !== 'object' || !('path' in issue) || !Array.isArray(issue.path))
      return [];
    const field = issue.path[0];
    const label =
      field === 'date'
        ? 'Дата'
        : field === 'custom_values'
          ? 'Дополнительное поле'
          : (FIELD_LABELS[field as keyof typeof FIELD_LABELS] ?? 'Значение');
    const detail = issue as Record<string, unknown>;
    const rule =
      detail.code === 'too_big' && typeof detail.maximum === 'number'
        ? `максимум ${detail.maximum}`
        : detail.code === 'too_small' && typeof detail.minimum === 'number'
          ? `минимум ${detail.minimum}`
          : 'проверьте значение';
    return [`${label}: ${rule}`];
  });
  return messages.length
    ? messages.join('; ')
    : 'Проверьте значения замера: сервер отклонил данные.';
}
