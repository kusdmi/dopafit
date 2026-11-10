import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { useEffect, type ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { useNavigation } from '@/shared/lib/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useWorkoutStore } from '@/entities/workout/model/store';
import { sessionKeyFor } from '@/entities/workout/model/types';
import { server } from '@/app/mocks/server';
import { env } from '@/shared/config/env';
import { localDateKey } from '@/shared/lib/time/localDateKey';

import { useFinishWorkout } from './use-finish-workout';

type RouterLocation = ReturnType<typeof useLocation>;

// Toggle the offline branch per-test.
const networkStatus = { isOnline: true, isOffline: false };
vi.mock('@/shared/lib/network/useNetworkStatus', () => ({
  useNetworkStatus: () => networkStatus,
}));

const SLOTS = [
  { slotId: 'sl1', variantId: 'v1', name: 'Жим лёжа', sets: 3, reps: 10, alternatives: [] },
];

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // Captures the current router location + history so navigation can be asserted
  // and driven from a test.
  const nav: { location: RouterLocation | null; history: ReturnType<typeof useNavigation> | null } =
    {
      location: null,
      history: null,
    };
  function LocationSpy() {
    const loc = useLocation();
    const history = useNavigation();
    useEffect(() => {
      nav.location = loc;
      nav.history = history;
    }, [loc, history]);
    return null;
  }
  function wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/workout']}>
          <LocationSpy />
          {children}
        </MemoryRouter>
      </QueryClientProvider>
    );
  }
  return { wrapper, nav };
}

describe('useFinishWorkout', () => {
  beforeEach(() => {
    networkStatus.isOnline = true;
    networkStatus.isOffline = false;
    useWorkoutStore.getState().reset();
  });

  it('open/cancel toggle the dialog state', () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useFinishWorkout(), { wrapper });

    expect(result.current.finishOpen).toBe(false);
    act(() => result.current.openFinish());
    expect(result.current.finishOpen).toBe(true);
    act(() => result.current.cancelFinish());
    expect(result.current.finishOpen).toBe(false);
  });

  it('online finish syncs, removes the session and navigates to the summary', async () => {
    useWorkoutStore
      .getState()
      .startSession({ participant: { kind: 'self' }, programId: 'p1', dayId: 'd1', slots: SLOTS });

    const { wrapper, nav } = makeWrapper();
    const { result } = renderHook(() => useFinishWorkout(), { wrapper });

    await act(async () => {
      await result.current.confirmFinish();
    });

    await waitFor(() => expect(nav.location?.pathname).toMatch(/summary/));
    // Session removed; no active session lingers.
    expect(useWorkoutStore.getState().sessions.self).toBeUndefined();
    expect(useWorkoutStore.getState().activeKey).toBeNull();
    expect(result.current.finishOpen).toBe(false);
    expect(result.current.finishError).toBeNull();
  });

  it('finishing one of several client sessions keeps the remaining one active', async () => {
    const store = useWorkoutStore.getState();
    store.startSession({
      participant: { kind: 'self' },
      programId: 'p1',
      dayId: 'd1',
      slots: SLOTS,
    });
    store.startSession({
      participant: { kind: 'client', clientId: 'c1', clientName: 'Вася' },
      programId: 'p1',
      dayId: 'd1',
      slots: SLOTS,
    });
    // Make the self session the active one, then finish it.
    store.switchTo(sessionKeyFor({ kind: 'self' }));
    const remainingKey = sessionKeyFor({ kind: 'client', clientId: 'c1', clientName: 'Вася' });

    const { wrapper, nav } = makeWrapper();
    const { result } = renderHook(() => useFinishWorkout(), { wrapper });

    await act(async () => {
      await result.current.confirmFinish();
    });

    await waitFor(() => expect(nav.location?.pathname).toMatch(/summary/));
    // Dialog closed, self session gone, the client session is now active.
    expect(result.current.finishOpen).toBe(false);
    expect(useWorkoutStore.getState().sessions.self).toBeUndefined();
    expect(useWorkoutStore.getState().activeKey).toBe(remainingKey);
  });

  it('does not navigate to the summary if the user left the page before the sync resolves', async () => {
    // Delay the sync so we can navigate away before onSuccess fires — this models a
    // mid-flight reconnect replay: the observer resolves late while the user is on
    // another screen and must NOT be yanked to a stale summary.
    let release!: () => void;
    const gate = new Promise<void>((res) => {
      release = res;
    });
    server.use(
      http.post(`${env.apiUrl}/api/v1/workouts/sessions/sync`, async () => {
        await gate;
        return HttpResponse.json({
          session_id: 's1',
          seq_number: 1,
          finished_at: new Date().toISOString(),
          duration_seconds: 0,
          avg_rest_seconds: null,
          exercises: [],
        });
      }),
    );

    useWorkoutStore
      .getState()
      .startSession({ participant: { kind: 'self' }, programId: 'p1', dayId: 'd1', slots: SLOTS });

    const { wrapper, nav } = makeWrapper();
    const { result } = renderHook(() => useFinishWorkout(), { wrapper });

    await act(async () => {
      await result.current.confirmFinish();
    });

    // The user navigates elsewhere while the sync is still in flight.
    act(() => nav.history?.push('/home'));
    await waitFor(() => expect(nav.location?.pathname).toBe('/home'));

    // Let the sync resolve. onSuccess must see the changed pathname and skip the push.
    await act(async () => {
      release();
      await gate;
    });
    await waitFor(() => expect(result.current.pending).toBe(false));

    expect(nav.location?.pathname).toBe('/home');
    expect(nav.location?.pathname).not.toMatch(/summary/);
  });

  it('sends local_date derived from the LOCAL calendar date of startedAt', async () => {
    useWorkoutStore
      .getState()
      .startSession({ participant: { kind: 'self' }, programId: 'p1', dayId: 'd1', slots: SLOTS });

    // Pin the session start to a known LOCAL instant, then let `finished_at`/`now`
    // be a different (later) calendar day. This models an offline session finished
    // or replayed on a later date: local_date must still reflect the START day, not
    // `now`. Asserting against localDateKey(startedAt) keeps the test TZ-agnostic.
    const startedAt = new Date(2026, 2, 1, 23, 30, 0).toISOString(); // local 2026-03-01 23:30
    act(() => {
      useWorkoutStore.setState((s) => ({
        sessions: { ...s.sessions, self: { ...s.sessions.self!, startedAt } },
      }));
    });

    let captured: { started_at: string; local_date?: string | null } | null = null;
    server.use(
      http.post(`${env.apiUrl}/api/v1/workouts/sessions/sync`, async ({ request }) => {
        captured = (await request.json()) as typeof captured;
        return HttpResponse.json({
          session_id: 's1',
          seq_number: 1,
          finished_at: new Date().toISOString(),
          duration_seconds: 0,
          avg_rest_seconds: null,
          exercises: [],
        });
      }),
    );

    const { wrapper, nav } = makeWrapper();
    const { result } = renderHook(() => useFinishWorkout(), { wrapper });

    await act(async () => {
      await result.current.confirmFinish();
    });

    await waitFor(() => expect(nav.location?.pathname).toMatch(/summary/));
    expect(captured).not.toBeNull();
    const body = captured as unknown as { started_at: string; local_date?: string | null };
    expect(body.local_date).toBe(localDateKey(new Date(body.started_at)));
    expect(body.local_date).toBe('2026-03-01');
  });

  it('offline finish navigates to a local summary and removes the session (data not lost)', async () => {
    networkStatus.isOnline = false;
    networkStatus.isOffline = true;

    useWorkoutStore
      .getState()
      .startSession({ participant: { kind: 'self' }, programId: 'p1', dayId: 'd1', slots: SLOTS });
    useWorkoutStore.getState().addSet({ slotId: 'sl1', variantId: 'v1', weight: 50, reps: 10 });

    const { wrapper, nav } = makeWrapper();
    const { result } = renderHook(() => useFinishWorkout(), { wrapper });

    // Navigation follows completion of the local outbox write.
    await act(async () => {
      await result.current.confirmFinish();
    });

    expect(nav.location?.pathname).toMatch(/summary/);
    // Local summary is carried via router state with seq_number 0 (server assigns on replay).
    const state = nav.location?.state as { summary?: { seq_number: number } };
    expect(state.summary?.seq_number).toBe(0);
    expect(useWorkoutStore.getState().sessions.self).toBeUndefined();
    expect(useWorkoutStore.getState().activeKey).toBeNull();
  });
});

it('keeps the session and explains invalid recorded sets before finishing offline', async () => {
  networkStatus.isOnline = false;
  networkStatus.isOffline = true;
  useWorkoutStore.getState().reset();
  useWorkoutStore
    .getState()
    .startSession({ participant: { kind: 'self' }, programId: 'p1', dayId: 'd1', slots: SLOTS });
  useWorkoutStore.getState().addSet({ slotId: 'sl1', variantId: 'v1', weight: 2001, reps: 0 });
  const { wrapper } = makeWrapper();
  const { result } = renderHook(() => useFinishWorkout(), { wrapper });
  await act(async () => {
    await result.current.confirmFinish();
  });
  expect(result.current.finishError).toContain('Подход 1');
  expect(result.current.finishError).toContain('Вес от 0 до 2000 кг');
  expect(useWorkoutStore.getState().sessions.self).toBeDefined();
  networkStatus.isOnline = true;
  networkStatus.isOffline = false;
});
