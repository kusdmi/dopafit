import type { components } from '@/shared/api/schema';
import { repsSchema, setsSchema, weightSchema, trainingNameSchema } from './training';

type Program = components['schemas']['ProgramCreate'];
type Session = components['schemas']['SessionSyncRequest'];
export interface TrainingError {
  message: string;
  fields: Record<string, string>;
}
const reasons: Record<string, string> = {
  program_limit:
    'Достигнут лимит программ вашего тарифа. Удалите ненужную программу или подключите Премиум.',
  program_size: 'Размер программы превышает ограничения вашего тарифа.',
  free_selection_required: 'Подтвердите выбор доступных ресурсов в разделе «Премиум».',
  program_read_only: 'Программа доступна только для просмотра на вашем тарифе.',
  client_read_only: 'Клиент доступен только для просмотра на вашем тарифе.',
};
export function trainingError(error: unknown, program?: Program, session?: Session): TrainingError {
  const fields: Record<string, string> = {};
  const fallback = { message: 'Не удалось сохранить данные. Повторите попытку.', fields };
  if (!error || typeof error !== 'object' || !('code' in error)) return fallback;
  const e = error as { code: unknown; details?: unknown };
  if (e.code === 'conflict')
    return {
      message: 'Данные изменены в другом окне. Откройте актуальную версию перед сохранением.',
      fields,
    };
  if (e.code === 'network_error' || e.code === 'internal_error')
    return {
      message: 'Не удалось связаться с сервером. Данные сохранены в форме; повторите попытку.',
      fields,
    };
  if (e.code === 'forbidden') {
    const reason =
      e.details && typeof e.details === 'object' && 'reason' in e.details
        ? String(e.details.reason)
        : '';
    return { message: reasons[reason] ?? 'Нет доступа к сохранению этих данных.', fields };
  }
  if (e.code !== 'validation_error') return fallback;
  const messages: string[] = [];
  for (const raw of Array.isArray(e.details) ? e.details : []) {
    if (!raw || typeof raw !== 'object' || !('path' in raw) || !Array.isArray(raw.path)) continue;
    const path: unknown[] = raw.path;
    let label = 'Данные',
      id: string | undefined,
      schema;
    const field = path.at(-1);
    if (program && path[0] === 'name') {
      label = 'Название программы';
      id = program.id ?? undefined;
      schema = trainingNameSchema(255);
    }
    if (program && path[0] === 'days' && typeof path[1] === 'number') {
      const day = program.days[path[1]];
      if (!day) continue;
      label = `День «${day.name}»`;
      id = day.id ?? undefined;
      if (field === 'name') schema = trainingNameSchema(100);
      if (
        path[2] === 'slots' &&
        typeof path[3] === 'number' &&
        path[4] === 'exercises' &&
        typeof path[5] === 'number'
      ) {
        const exercise = day.slots?.[path[3]]?.exercises[path[5]];
        if (!exercise) continue;
        id = exercise.id ?? undefined;
        label += `, упражнение ${path[3] + 1}${path[5] ? `, альтернатива ${path[5]}` : ''}`;
        schema =
          field === 'sets'
            ? setsSchema
            : field === 'reps'
              ? repsSchema
              : field === 'custom_name'
                ? trainingNameSchema(255)
                : undefined;
      }
    }
    if (session && path[0] === 'sets' && typeof path[1] === 'number') {
      const set = session.sets[path[1]];
      if (!set) continue;
      id = set.id;
      label = `Подход ${path[1] + 1}`;
      schema = field === 'weight' ? weightSchema : field === 'reps' ? repsSchema : undefined;
    }
    const fieldLabel =
      field === 'sets'
        ? 'подходы'
        : field === 'reps'
          ? 'повторы'
          : field === 'weight'
            ? 'вес'
            : field === 'name' || field === 'custom_name'
              ? 'название'
              : 'значение';
    let value: unknown = program ?? session;
    for (const key of path)
      value =
        value && typeof value === 'object' && (typeof key === 'string' || typeof key === 'number')
          ? (value as Record<string, unknown>)[key]
          : undefined;
    const parsed = schema?.safeParse(value);
    const issue = raw as Record<string, unknown>;
    const serverMessage =
      issue.code === 'too_big' && typeof issue.maximum === 'number'
        ? `Максимум ${issue.maximum}${issue.origin === 'string' ? ' символов' : ''}`
        : issue.code === 'too_small' && typeof issue.minimum === 'number'
          ? `Минимум ${issue.minimum}${issue.origin === 'string' ? ' символов' : ''}`
          : issue.code === 'invalid_type' && issue.expected === 'int'
            ? 'Введите целое число'
            : 'Проверьте значение';
    const message =
      parsed && !parsed.success
        ? (parsed.error.issues[0]?.message ?? 'Проверьте значение')
        : serverMessage;
    if (id) fields[`${id}:${String(field)}`] = message;
    messages.push(`${label}, ${fieldLabel}: ${message}`);
  }
  return {
    message: messages.length
      ? [...new Set(messages)].join('; ')
      : 'Проверьте заполненные поля: сервер отклонил данные.',
    fields,
  };
}
