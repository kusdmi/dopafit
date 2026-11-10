import { z } from 'zod';
import { containsProfanity } from './profanity';

export const numericInput = z.union([
  z.number(),
  z
    .string()
    .trim()
    .min(1, 'Обязательное поле')
    .regex(/^-?\d+(?:[.,]\d+)?$/, 'Введите число')
    .transform((value) => Number(value.replace(',', '.'))),
]);
export const setsSchema = numericInput.pipe(
  z
    .number()
    .int('Введите целое число подходов')
    .min(1, 'От 1 до 99 подходов')
    .max(99, 'От 1 до 99 подходов'),
);
export const repsSchema = numericInput.pipe(
  z
    .number()
    .int('Введите целое число повторов')
    .min(1, 'От 1 до 999 повторов')
    .max(999, 'От 1 до 999 повторов'),
);
export const weightSchema = numericInput.pipe(
  z.number().min(0, 'Вес от 0 до 2000 кг').max(2000, 'Вес от 0 до 2000 кг'),
);
export const setValuesSchema = z.object({ weight: weightSchema, reps: repsSchema });
export const exerciseParamsSchema = z.object({ sets: setsSchema, reps: repsSchema });
export const trainingNameSchema = (max: number) =>
  z
    .string()
    .trim()
    .min(1, 'Укажите название')
    .max(max, `Максимум ${max} символов`)
    .refine((value) => !containsProfanity(value), 'Недопустимое название');
export function fieldError(schema: z.ZodType, value: unknown): string | undefined {
  const result = schema.safeParse(value);
  return result.success ? undefined : result.error.issues[0]?.message;
}
