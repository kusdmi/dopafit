import { newPasswordSchema } from '@/shared/lib/validation/password';
import { z } from 'zod';

import type { components } from '@/shared/api/schema';

type OnboardingRequest = components['schemas']['OnboardingRequest'];

const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function inRange(value: string, min: number, max: number) {
  const number = Number(value);
  return value.trim() !== '' && Number.isFinite(number) && number >= min && number <= max;
}

// Personal-data consent is no longer a user-facing checkbox (product decision):
// AccountStep shows a static caption with a link to the policy instead, right
// under the submit button, and the form always sends
// personal_data_consent: true — the backend
// (backend/src/modules/auth/application/registration.ts) still requires the
// field truthy and throws validation_error otherwise, so it stays in the
// request payload without being user-editable.
export const accountSchema = z.object({
  full_name: z.string().min(2, 'Введите имя'),
  email: z.string().regex(emailPattern, 'Введите корректный email'),
  invite_code: z.string().optional(),
  role: z.enum(['client', 'trainer']),
});

export const passwordSchema = z
  .object({
    password: newPasswordSchema,
    password_repeat: z.string(),
  })
  .refine((value) => value.password === value.password_repeat, {
    message: 'Пароли не совпадают',
    path: ['password_repeat'],
  });

// Возраст, который допускает дата рождения. Совпадает с ограничением бэкенда
// (OnboardingRequest.birth_date в modules/auth/http/schemas.ts): оно задано
// относительно «сегодня», поэтому в контракте живёт описанием, а не minimum/maximum.
const MIN_AGE = 10;
const MAX_AGE = 120;

/** Дата рождения в пределах допустимого возраста (будущие даты отсекаются тем же условием). */
export function isBirthDateInRange(value: string) {
  const birth = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(birth.getTime())) return false;
  const now = new Date();
  const earliest = Date.UTC(now.getUTCFullYear() - MAX_AGE, now.getUTCMonth(), now.getUTCDate());
  const latest = Date.UTC(now.getUTCFullYear() - MIN_AGE, now.getUTCMonth(), now.getUTCDate());
  return birth.getTime() >= earliest && birth.getTime() <= latest;
}

export const physicalSchema = z.object({
  gender: z.enum(['male', 'female'], { message: 'Выберите пол' }),
  birth_date: z.string().refine(isBirthDateInRange, 'Возраст должен быть от 10 до 120 лет'),
  weight: z.string().refine((value) => inRange(value, 20, 300), 'От 20 до 300 кг'),
  height: z.string().refine((value) => inRange(value, 100, 250), 'От 100 до 250 см'),
});

export const trainerSchema = z.object({
  clients_per_month: z
    .string()
    .refine(
      (value) => value === '' || (inRange(value, 0, 1000) && Number.isInteger(Number(value))),
      'От 0 до 1000 клиентов',
    ),
});

export type AccountValues = z.infer<typeof accountSchema>;
export type PasswordValues = z.infer<typeof passwordSchema>;
export type PhysicalValues = z.infer<typeof physicalSchema>;
export type TrainerValues = z.infer<typeof trainerSchema>;

export function toOnboardingRequest(
  values: PhysicalValues,
  clientsPerMonth?: string | null,
): OnboardingRequest {
  return {
    gender: values.gender,
    birth_date: values.birth_date,
    weight: Number(values.weight),
    height: Number(values.height),
    clients_per_month:
      clientsPerMonth && clientsPerMonth.trim() !== '' ? Number(clientsPerMonth) : null,
  };
}
