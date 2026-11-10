import { z } from 'zod';

export const PASSWORD_REQUIREMENTS =
  'От 8 до 32 символов, включая заглавную и строчную латинские буквы и цифру';

export const newPasswordSchema = z
  .string()
  .min(8, PASSWORD_REQUIREMENTS)
  .max(32, PASSWORD_REQUIREMENTS)
  .regex(/[a-z]/, PASSWORD_REQUIREMENTS)
  .regex(/[A-Z]/, PASSWORD_REQUIREMENTS)
  .regex(/[0-9]/, PASSWORD_REQUIREMENTS);
