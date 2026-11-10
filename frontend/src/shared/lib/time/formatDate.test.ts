import { describe, expect, it } from 'vitest';

import {
  formatDateFull,
  formatDate,
  formatDateNumeric,
  formatDateTime,
  formatDateShort,
  formatHistoryDate,
} from './formatDate';

describe('formatDate', () => {
  it('formats date-only iso with the day before the Russian month', () => {
    expect(formatDate('2026-06-22')).toBe('22 июня 2026');
  });

  it('uses only the date part of a full iso datetime', () => {
    expect(formatDate('2026-03-01T23:59:00Z')).toBe('1 марта 2026');
  });
});

describe('formatDateShort', () => {
  it('formats to day + short russian month', () => {
    expect(formatDateShort('2026-03-01')).toBe('1 мар');
  });
});

describe('formatHistoryDate', () => {
  const now = new Date(2026, 5, 22); // 2026-06-22, local

  it("returns 'Сегодня' for the same local day", () => {
    expect(formatHistoryDate('2026-06-22', now)).toBe('Сегодня');
  });

  it("returns 'Вчера' for the previous local day", () => {
    expect(formatHistoryDate('2026-06-21', now)).toBe('Вчера');
  });

  it('returns day + full month without year for the current year', () => {
    expect(formatHistoryDate('2026-03-01', now)).toBe('1 марта');
  });

  it('includes the year for past years', () => {
    expect(formatHistoryDate('2025-12-31', now)).toBe('31 декабря 2025');
  });

  it('ignores the time part and timezone of a full iso datetime', () => {
    expect(formatHistoryDate('2026-06-22T23:30:00Z', now)).toBe('Сегодня');
  });
});

// Заголовок карточки замера (макет 758:2726) — всегда полная дата с годом, без
// «Сегодня»/«Вчера», которыми оперирует formatHistoryDate.
describe('formatDateFull', () => {
  it('spells the month and always keeps the year', () => {
    expect(formatDateFull('2026-01-23')).toBe('23 января 2026');
  });

  it('does not fall back to relative wording for today', () => {
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
      today.getDate(),
    ).padStart(2, '0')}`;
    expect(formatDateFull(iso)).not.toBe('Сегодня');
    expect(formatDateFull(iso)).toContain(String(today.getFullYear()));
  });

  it('reads the day from the ISO string without timezone drift', () => {
    expect(formatDateFull('2026-03-01')).toBe('1 марта 2026');
    expect(formatDateFull('2026-12-31')).toBe('31 декабря 2026');
  });
});

describe('compact dates and local timestamps', () => {
  it('keeps compact dates day-first with dots', () => {
    expect(formatDateNumeric('2026-03-01')).toBe('01.03.2026');
    expect(formatDateNumeric('2026-12-31T23:59:00Z')).toBe('31.12.2026');
  });

  it('formats local timestamps without seconds', () => {
    expect(formatDateTime('2026-03-01T17:05:42')).toBe('1 марта 2026, 17:05');
  });
});
