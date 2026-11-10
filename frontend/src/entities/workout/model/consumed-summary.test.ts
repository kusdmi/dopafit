import { beforeEach, describe, expect, it } from 'vitest';

import { useConsumedSummaryStore } from './consumed-summary';

describe('useConsumedSummaryStore', () => {
  beforeEach(() => {
    useConsumedSummaryStore.getState().clear();
  });

  it('starts with no consumed session', () => {
    const { lastConsumedSessionId, isConsumed } = useConsumedSummaryStore.getState();
    expect(lastConsumedSessionId).toBeNull();
    expect(isConsumed('s1')).toBe(false);
  });

  it('marks a session as consumed', () => {
    useConsumedSummaryStore.getState().markConsumed('s1');
    expect(useConsumedSummaryStore.getState().isConsumed('s1')).toBe(true);
    expect(useConsumedSummaryStore.getState().lastConsumedSessionId).toBe('s1');
  });

  it('only treats the marked session as consumed, not others', () => {
    useConsumedSummaryStore.getState().markConsumed('s1');
    expect(useConsumedSummaryStore.getState().isConsumed('s2')).toBe(false);
  });

  it('tracks only the latest consumed session (single value, no growth)', () => {
    useConsumedSummaryStore.getState().markConsumed('s1');
    useConsumedSummaryStore.getState().markConsumed('s2');
    expect(useConsumedSummaryStore.getState().isConsumed('s1')).toBe(false);
    expect(useConsumedSummaryStore.getState().isConsumed('s2')).toBe(true);
  });

  it('clear resets the marker so a session is no longer consumed', () => {
    useConsumedSummaryStore.getState().markConsumed('s1');
    useConsumedSummaryStore.getState().clear();
    expect(useConsumedSummaryStore.getState().lastConsumedSessionId).toBeNull();
    expect(useConsumedSummaryStore.getState().isConsumed('s1')).toBe(false);
  });
});
