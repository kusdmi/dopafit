import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { ActiveSession } from '@/entities/workout/model/types';

import { WorkoutHistorySection } from './WorkoutHistorySection';

const loggedSet: ActiveSession['sets'][number] = {
  id: 'set-1',
  slotId: 'slot-1',
  variantId: 'variant-1',
  weight: 20,
  reps: 15,
  performedAt: '2026-09-15T08:00:00.000Z',
};

function renderSection(props: Partial<Parameters<typeof WorkoutHistorySection>[0]> = {}) {
  return render(
    <WorkoutHistorySection
      open
      onToggle={() => {}}
      currentSets={[]}
      historyLoading={false}
      historyDays={[]}
      onSelectSet={() => {}}
      {...props}
    />,
  );
}

describe('WorkoutHistorySection', () => {
  it('shows the empty notice only when nothing has been logged at all', () => {
    renderSection();
    expect(screen.getByText('Пока нет записей')).toBeInTheDocument();
  });

  it('drops the empty notice once the current session has a logged set', () => {
    renderSection({ currentSets: [loggedSet] });
    expect(screen.getByText('Эта тренировка')).toBeInTheDocument();
    expect(screen.queryByText('Пока нет записей')).not.toBeInTheDocument();
  });

  it('heads past days with their own label so they do not merge into the current session', () => {
    renderSection({
      currentSets: [loggedSet],
      historyDays: [
        {
          date: '2026-09-10',
          entries: [
            { set_id: 'old-1', weight: 18, reps: 12, performed_at: '2026-09-10T08:00:00.000Z' },
          ],
        },
      ],
    });
    expect(screen.getByText('Эта тренировка')).toBeInTheDocument();
    expect(screen.getByText('Прошлые тренировки')).toBeInTheDocument();
    expect(screen.queryByText('Пока нет записей')).not.toBeInTheDocument();
  });
});
