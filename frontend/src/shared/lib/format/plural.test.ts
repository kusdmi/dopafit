import { describe, expect, it } from 'vitest';

import { plural, reps, sets, volumeLabel } from './plural';

describe('plural', () => {
  it('picks the singular form for numbers ending in 1', () => {
    expect(plural(1, 'подход', 'подхода', 'подходов')).toBe('подход');
    expect(plural(21, 'подход', 'подхода', 'подходов')).toBe('подход');
    expect(plural(101, 'подход', 'подхода', 'подходов')).toBe('подход');
  });

  it('picks the few form for numbers ending in 2-4', () => {
    expect(plural(2, 'подход', 'подхода', 'подходов')).toBe('подхода');
    expect(plural(4, 'подход', 'подхода', 'подходов')).toBe('подхода');
    expect(plural(23, 'подход', 'подхода', 'подходов')).toBe('подхода');
  });

  it('picks the many form for 0, 5-20 and the teens exception', () => {
    expect(plural(0, 'подход', 'подхода', 'подходов')).toBe('подходов');
    expect(plural(5, 'подход', 'подхода', 'подходов')).toBe('подходов');
    expect(plural(11, 'подход', 'подхода', 'подходов')).toBe('подходов');
    expect(plural(12, 'подход', 'подхода', 'подходов')).toBe('подходов');
    expect(plural(14, 'подход', 'подхода', 'подходов')).toBe('подходов');
    expect(plural(20, 'подход', 'подхода', 'подходов')).toBe('подходов');
    expect(plural(111, 'подход', 'подхода', 'подходов')).toBe('подходов');
  });

  it('formats counted sets and reps', () => {
    expect(sets(1)).toBe('1 подход');
    expect(sets(4)).toBe('4 подхода');
    expect(sets(8)).toBe('8 подходов');
    expect(reps(1)).toBe('1 повторение');
    expect(reps(3)).toBe('3 повторения');
    expect(reps(15)).toBe('15 повторений');
  });

  it('formats the exercise volume line', () => {
    expect(volumeLabel(4, 8)).toBe('4 подхода × 8 повторений');
    expect(volumeLabel(3, 15)).toBe('3 подхода × 15 повторений');
    expect(volumeLabel(1, 1)).toBe('1 подход × 1 повторение');
  });
});
