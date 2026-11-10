import { describe, expect, it } from 'vitest';

import { containsProfanity } from './profanity';

describe('containsProfanity', () => {
  it('returns false for clean text', () => {
    expect(containsProfanity('День ног')).toBe(false);
  });

  it('detects a banned root regardless of case', () => {
    expect(containsProfanity('БЛЯ день')).toBe(true);
  });

  it('detects a banned root inside a word', () => {
    expect(containsProfanity('охуенный день')).toBe(true);
  });

  it('does not flag legitimate words like "мудрость"', () => {
    expect(containsProfanity('мудрость')).toBe(false);
  });
});
