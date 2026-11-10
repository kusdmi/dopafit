import { describe, expect, it } from 'vitest';

import { formatDuration } from './useElapsed';

describe('formatDuration', () => {
  it('formats sub-hour durations as M:SS', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(5)).toBe('0:05');
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(125)).toBe('2:05');
    expect(formatDuration(599)).toBe('9:59');
    expect(formatDuration(3599)).toBe('59:59');
  });

  it('formats durations of an hour or more as H:MM:SS', () => {
    expect(formatDuration(3600)).toBe('1:00:00');
    expect(formatDuration(3661)).toBe('1:01:01');
    expect(formatDuration(7505)).toBe('2:05:05');
    expect(formatDuration(36000)).toBe('10:00:00');
  });

  it('treats negative and fractional input safely', () => {
    expect(formatDuration(-5)).toBe('0:00');
    expect(formatDuration(65.9)).toBe('1:05');
  });
});
