import { beforeEach, describe, expect, it } from 'vitest';

import { recentExercises } from './recent-exercises';

describe('recentExercises', () => {
  beforeEach(() => window.localStorage.clear());

  it('returns empty initially', () => {
    expect(recentExercises.get()).toEqual([]);
  });

  it('pushes newest first and dedupes', () => {
    recentExercises.push('a');
    recentExercises.push('b');
    recentExercises.push('a');
    expect(recentExercises.get()).toEqual(['a', 'b']);
  });

  it('caps at 10 entries', () => {
    for (let i = 0; i < 12; i += 1) recentExercises.push(`ex-${i}`);
    const list = recentExercises.get();
    expect(list).toHaveLength(10);
    expect(list[0]).toBe('ex-11');
    expect(list).not.toContain('ex-0');
    expect(list).not.toContain('ex-1');
  });
});
