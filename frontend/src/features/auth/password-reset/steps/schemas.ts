import { newPasswordSchema } from '@/shared/lib/validation/password';
import { z } from 'zod';

const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const contactSchema = z.object({
  email: z.string().regex(emailPattern, 'Введите корректный email'),
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

export type ContactValues = z.infer<typeof contactSchema>;
export type PasswordValues = z.infer<typeof passwordSchema>;

export const CODE_ERROR = 'Неверный или просроченный код';
