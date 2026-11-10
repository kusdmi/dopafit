import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { useWorkoutStore } from '@/entities/workout/model/store';
import type { Participant } from '@/entities/workout/model/types';

import { SessionTabs } from './SessionTabs';

function start(participant: Participant) {
  useWorkoutStore.getState().startSession({
    participant,
    programId: 'p1',
    dayId: 'd1',
    slots: [{ slotId: 'sl1', variantId: 'v1', name: 'Жим', sets: 3, reps: 10, alternatives: [] }],
  });
}

beforeEach(() => useWorkoutStore.getState().reset());
afterEach(() => useWorkoutStore.getState().reset());

it('renders nothing with a single session', () => {
  start({ kind: 'self' });
  const { container } = render(<SessionTabs />);
  expect(container).toBeEmptyDOMElement();
});

it('renders a card per session and switches on tap', () => {
  start({ kind: 'client', clientId: 'a', clientName: 'Аня' });
  start({ kind: 'client', clientId: 'b', clientName: 'Боря' });
  render(<SessionTabs />);
  expect(screen.getByText('Аня')).toBeInTheDocument();
  expect(screen.getByText('Боря')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Аня'));
  expect(useWorkoutStore.getState().activeKey).toBe('client:a');
});
