import { z } from 'zod';

const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const emailRule = z.string().regex(emailPattern, 'Введите корректный email');
const passwordRule = z.string().min(1, 'Введите пароль');

export const codeModeSchema = z.object({ email: emailRule });
export const passwordModeSchema = z.object({ email: emailRule, password: passwordRule });
export const twoFactorSchema = z.object({ password: passwordRule });

export type CodeModeValues = z.infer<typeof codeModeSchema>;
export type PasswordModeValues = z.infer<typeof passwordModeSchema>;
export type TwoFactorValues = z.infer<typeof twoFactorSchema>;

/** Same message for not_found and validation_error: never reveal whether the
 *  account exists (anti-enumeration). */
export const CODE_ERROR = 'Неверный или просроченный код';
