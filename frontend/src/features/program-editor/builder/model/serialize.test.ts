import { describe, expect, it } from 'vitest';

import { serializeDraft } from './serialize';
import type { DraftProgram } from './store';

const draft: DraftProgram = {
  id: 'p1',
  name: 'Программа',
  kind: 'strength',
  fromStandard: false,
  days: [
    {
      id: 'd1',
      name: 'День 1',
      position: 0,
      slots: [
        {
          id: 's1',
          position: 0,
          exercises: [
            { id: 'se1', exercise_id: null, custom_name: 'Жим', name: 'Жим', sets: 4, reps: 8, variant_order: 0 },
            { id: 'se2', exercise_id: null, custom_name: 'Отжимания', name: 'Отжимания', sets: 3, reps: 12, variant_order: 1 },
          ],
        },
      ],
    },
  ],
};

describe('serializeDraft', () => {
  it('maps draft tree to ProgramCreate with exactly one primary per slot', () => {
    const payload = serializeDraft(draft);
    expect(payload.id).toBe('p1');
    expect(payload.days[0].slots[0].exercises.filter((e) => e.variant_order === 0)).toHaveLength(1);
    expect(payload.days[0].slots[0].exercises.map((e) => e.variant_order)).toEqual([0, 1]);
  });
});
