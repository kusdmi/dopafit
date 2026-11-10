import { describe, expect, it } from 'vitest';

import { localDateKey } from './localDateKey';

describe('localDateKey', () => {
  it('formats a local date as zero-padded YYYY-MM-DD', () => {
    expect(localDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(localDateKey(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  it('uses LOCAL calendar fields (no UTC/toISOString shift)', () => {
    const d = new Date(2026, 6, 4, 23, 59, 59);
    expect(localDateKey(d)).toBe('2026-07-04');
    // Sanity: this is exactly getFullYear/getMonth/getDate, not toISOString.
    expect(localDateKey(d)).toBe(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate(),
      ).padStart(2, '0')}`,
    );
  });
});
