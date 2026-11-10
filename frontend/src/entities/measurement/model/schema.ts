import { z } from 'zod';
import { numericInput } from '@/shared/lib/validation/training';

import { ALL_FIELDS } from './fields';

export const measurementNumberSchema = numericInput.pipe(
  z.number().min(0, 'Значение не может быть отрицательным').max(9999.9, 'Максимум 9999,9'),
);
const optionalNumber = z
  .union([z.string(), z.number(), z.nan()])
  .optional()
  .transform((value, ctx) => {
    if (
      value === undefined ||
      (typeof value === 'string' && value.trim() === '') ||
      (typeof value === 'number' && Number.isNaN(value))
    )
      return undefined;
    const parsed = measurementNumberSchema.safeParse(value);
    if (parsed.success) return parsed.data;
    ctx.addIssue({ code: 'custom', message: parsed.error.issues[0]?.message ?? 'Введите число' });
    return z.NEVER;
  });

const fieldShape = Object.fromEntries(ALL_FIELDS.map((f) => [f, optionalNumber])) as {
  [Field in (typeof ALL_FIELDS)[number]]: typeof optionalNumber;
};

export const measurementFormSchema = z
  .object({
    date: z.string().date('Укажите корректную дату'),
    ...fieldShape,
    custom_values: z
      .array(
        z.object({
          slot: z.number().int().min(1).max(3),
          name: z.string(),
          unit: z.string(),
          value: numericInput.pipe(z.number()),
        }),
      )
      .optional(),
  })
  .refine(
    (data) =>
      ALL_FIELDS.some((f) => (data as Record<string, unknown>)[f] !== undefined) ||
      (data.custom_values?.length ?? 0) > 0,
    { message: 'Заполните хотя бы одно поле', path: ['date'] },
  );

export type MeasurementFormValues = z.infer<typeof measurementFormSchema>;

export type MeasurementFormInput = z.input<typeof measurementFormSchema>;
