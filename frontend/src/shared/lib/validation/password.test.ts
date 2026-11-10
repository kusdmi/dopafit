import { describe, expect, it } from 'vitest';
import { newPasswordSchema } from './password';

describe('new passwords', () => {
  it.each(['Ab123456', 'Aa1' + 'x'.repeat(29), 'Aa123!пароль'])(
    'accepts required Latin letters and optional extra characters: %s',
    (value) => {
      expect(newPasswordSchema.safeParse(value).success).toBe(true);
    },
  );
  it.each(['Пароль123', 'Aa12345', 'Aa1' + 'x'.repeat(30), 'abcd1234', 'ABCD1234', 'Abcdefgh'])(
    'rejects a password missing a requirement: %s',
    (value) => {
      expect(newPasswordSchema.safeParse(value).success).toBe(false);
    },
  );
});
