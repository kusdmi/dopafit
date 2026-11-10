import { waitFor } from '@testing-library/react';
import { resetNetworkStatusForTests } from '../network/useNetworkStatus';
import { MutationObserver, QueryClient, onlineManager } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ADD_EXERCISE_TO_PROGRAM_KEY,
  ADD_SUPPORT_REPLY_KEY,
  CREATE_SUPPORT_TICKET_KEY,
  MARK_NOTIFICATIONS_READ_KEY,
  SAVE_MEASUREMENT_KEY,
  SAVE_NOTIFICATION_SETTINGS_KEY,
  SAVE_PROGRAM_KEY,
  SET_FAVORITE_KEY,
  SYNC_WORKOUT_KEY,
  UPDATE_MEASUREMENT_KEY,
} from './mutationKeys';
import {
  bindOnlineManager,
  registerNotificationSupportMutationDefaults,
  registerStage3MutationDefaults,
  registerMeasurementMutationDefaults,
  registerWorkoutMutationDefaults,
} from './setupOffline';

// Runs a mutation through the registered DEFAULTS (mutationKey only, no inline
// options) so the assertions cover the exact code path that resumePausedMutations
// replays after a hard reload — the dehydrated mutation carries only its key and
// relies on the defaults for both mutationFn and callbacks.
async function runViaDefaults(
  qc: QueryClient,
  mutationKey: readonly unknown[],
  variables: unknown,
): Promise<void> {
  const observer = new MutationObserver<unknown, unknown, unknown>(qc, {
    mutationKey: [...mutationKey],
  });
  await observer.mutate(variables);
}

function invalidatedKeys(spy: ReturnType<typeof vi.spyOn>): string[] {
  return spy.mock.calls.map((c: unknown[]) =>
    JSON.stringify((c[0] as { queryKey: unknown }).queryKey),
  );
}

describe('offline setup', () => {
  afterEach(() => onlineManager.setOnline(true));

  it('registers mutation defaults for saving and updating measurements', () => {
    const qc = new QueryClient();
    const save = vi.fn();
    const update = vi.fn();
    registerMeasurementMutationDefaults(qc, { save, update });
    expect(qc.getMutationDefaults(SAVE_MEASUREMENT_KEY)?.mutationFn).toBe(save);
    expect(qc.getMutationDefaults([...UPDATE_MEASUREMENT_KEY])?.mutationFn).toBe(update);
  });

  it('calls the API and invalidates the list + analytics from the UPDATE_MEASUREMENT default (online + replay path)', async () => {
    const qc = new QueryClient();
    const update = vi.fn().mockResolvedValue({ id: 'm1' });
    registerMeasurementMutationDefaults(qc, { save: vi.fn(), update });
    const spy = vi.spyOn(qc, 'invalidateQueries');

    await runViaDefaults(qc, UPDATE_MEASUREMENT_KEY, {
      measurementId: 'm1',
      body: { id: 'm1', date: '2026-06-13', custom_values: [] },
    });

    // The update fn must receive the variables (id in vars) so a replayed offline
    // edit still targets the right record after a restart.
    expect(update.mock.calls[0][0]).toEqual({
      measurementId: 'm1',
      body: { id: 'm1', date: '2026-06-13', custom_values: [] },
    });
    const keys = invalidatedKeys(spy);
    expect(keys).toContain(JSON.stringify(['measurements', 'list']));
    expect(keys).toContain(JSON.stringify(['analytics']));
    // Detail key must also be invalidated so an open measurement screen refreshes.
    expect(keys).toContain(JSON.stringify(['measurements', 'm1']));
  });

  it('moves the cached measurement row to the new date before a reload', async () => {
    const qc = new QueryClient();
    qc.setQueryData(['measurements', 'list'], {
      items: [{ id: 'm1', date: '2026-06-13', weight: 78 }],
      total: 1,
    });
    registerMeasurementMutationDefaults(qc, {
      save: vi.fn(),
      update: vi.fn().mockResolvedValue({ id: 'm1', date: '2026-06-15', weight: 78 }),
    });

    await runViaDefaults(qc, UPDATE_MEASUREMENT_KEY, {
      measurementId: 'm1',
      body: { id: 'm1', date: '2026-06-15', weight: 78, custom_values: [] },
    });

    expect(qc.getQueryData(['measurements', 'list'])).toMatchObject({
      items: [{ id: 'm1', date: '2026-06-15', weight: 78 }],
    });
  });

  it('registers mutation defaults for the three stage-3 mutations', () => {
    const qc = new QueryClient();
    const saveProgram = vi.fn();
    const addExercise = vi.fn();
    const setFavorite = vi.fn();
    registerStage3MutationDefaults(qc, { saveProgram, addExercise, setFavorite });
    expect(qc.getMutationDefaults([...SAVE_PROGRAM_KEY])?.mutationFn).toBe(saveProgram);
    expect(qc.getMutationDefaults([...ADD_EXERCISE_TO_PROGRAM_KEY])?.mutationFn).toBe(addExercise);
    expect(qc.getMutationDefaults([...SET_FAVORITE_KEY])?.mutationFn).toBe(setFavorite);
  });

  it('pauses mutations when offline', () => {
    onlineManager.setOnline(false);
    expect(onlineManager.isOnline()).toBe(false);
  });

  it('invalidates workout-related queries from the SYNC_WORKOUT default (online + replay path)', async () => {
    const qc = new QueryClient();
    registerWorkoutMutationDefaults(qc, vi.fn().mockResolvedValue({ seq_number: 1 }));
    const spy = vi.spyOn(qc, 'invalidateQueries');

    await runViaDefaults(qc, SYNC_WORKOUT_KEY, { id: 's1', sets: [] });

    const keys = invalidatedKeys(spy);
    expect(keys).toContain(JSON.stringify(['analytics']));
    expect(keys).toContain(JSON.stringify(['calendar']));
    expect(keys).toContain(JSON.stringify(['workouts', 'history']));
    expect(keys).toContain(JSON.stringify(['workouts', 'summary', 's1']));
    expect(keys).toContain(JSON.stringify(['clients']));
  });

  it('invalidates the program list AND detail from the SAVE_PROGRAM default on update', async () => {
    const qc = new QueryClient();
    registerStage3MutationDefaults(qc, {
      saveProgram: vi.fn().mockResolvedValue({ id: 'p1' }),
      addExercise: vi.fn(),
      setFavorite: vi.fn(),
    });
    const spy = vi.spyOn(qc, 'invalidateQueries');

    await runViaDefaults(qc, SAVE_PROGRAM_KEY, { body: {}, programId: 'p1' });

    const keys = invalidatedKeys(spy);
    expect(keys).toContain(JSON.stringify(['programs', 'list']));
    expect(keys).toContain(JSON.stringify(['programs', 'detail', 'p1']));
  });

  function registerNotificationSupport(qc: QueryClient) {
    const markRead = vi.fn().mockResolvedValue(undefined);
    const saveNotificationSettings = vi.fn().mockResolvedValue({});
    const createTicket = vi.fn().mockResolvedValue({ id: 't1' });
    const addReply = vi.fn().mockResolvedValue(undefined);
    registerNotificationSupportMutationDefaults(qc, {
      markRead,
      saveNotificationSettings,
      createTicket,
      addReply,
    });
    return { markRead, saveNotificationSettings, createTicket, addReply };
  }

  it('registers mutation defaults for the notification + support mutations', () => {
    const qc = new QueryClient();
    const fns = registerNotificationSupport(qc);
    expect(qc.getMutationDefaults([...MARK_NOTIFICATIONS_READ_KEY])?.mutationFn).toBe(fns.markRead);
    expect(qc.getMutationDefaults([...SAVE_NOTIFICATION_SETTINGS_KEY])?.mutationFn).toBe(
      fns.saveNotificationSettings,
    );
    expect(qc.getMutationDefaults([...CREATE_SUPPORT_TICKET_KEY])?.mutationFn).toBe(
      fns.createTicket,
    );
    expect(qc.getMutationDefaults([...ADD_SUPPORT_REPLY_KEY])?.mutationFn).toBe(fns.addReply);
  });

  it('calls the API and invalidates the feed from the MARK_NOTIFICATIONS_READ default', async () => {
    const qc = new QueryClient();
    const fns = registerNotificationSupport(qc);
    const spy = vi.spyOn(qc, 'invalidateQueries');

    await runViaDefaults(qc, MARK_NOTIFICATIONS_READ_KEY, { notificationIds: ['n1'] });

    // TanStack passes a mutation context as the 2nd arg; assert the vars only.
    expect(fns.markRead.mock.calls[0][0]).toEqual({ notificationIds: ['n1'] });
    expect(invalidatedKeys(spy)).toContain(JSON.stringify(['notifications', 'feed']));
  });

  it('drops the unread count for a single notification marked read on open', async () => {
    // Тап по уведомлению уводит с экрана, и перезапрос ленты может не случиться —
    // счётчик должен упасть на оптимистичном обновлении кэша, а не на refetch'е.
    const qc = new QueryClient();
    registerNotificationSupport(qc);
    qc.setQueryData(['notifications', 'feed'], {
      items: [
        { id: 'n1', is_read: false },
        { id: 'n2', is_read: false },
      ],
      total: 2,
      unread: 2,
    });

    await runViaDefaults(qc, MARK_NOTIFICATIONS_READ_KEY, { notificationIds: ['n1'] });

    expect(qc.getQueryData(['notifications', 'feed'])).toMatchObject({
      items: [
        { id: 'n1', is_read: true },
        { id: 'n2', is_read: false },
      ],
      unread: 1,
    });
  });

  it('calls the API and invalidates settings from the SAVE_NOTIFICATION_SETTINGS default', async () => {
    const qc = new QueryClient();
    const fns = registerNotificationSupport(qc);
    const spy = vi.spyOn(qc, 'invalidateQueries');

    await runViaDefaults(qc, SAVE_NOTIFICATION_SETTINGS_KEY, { workout_reminders: true });

    expect(fns.saveNotificationSettings.mock.calls[0][0]).toEqual({ workout_reminders: true });
    expect(invalidatedKeys(spy)).toContain(JSON.stringify(['notifications', 'settings']));
  });

  it('calls the API and invalidates tickets from the CREATE_SUPPORT_TICKET default', async () => {
    const qc = new QueryClient();
    const fns = registerNotificationSupport(qc);
    const spy = vi.spyOn(qc, 'invalidateQueries');

    await runViaDefaults(qc, CREATE_SUPPORT_TICKET_KEY, { subject: 's', message: 'm' });

    expect(fns.createTicket.mock.calls[0][0]).toEqual({ subject: 's', message: 'm' });
    expect(invalidatedKeys(spy)).toContain(JSON.stringify(['support', 'tickets']));
  });

  it('replays ADD_SUPPORT_REPLY from variables (ticketId in vars) and invalidates the ticket', async () => {
    const qc = new QueryClient();
    const fns = registerNotificationSupport(qc);
    const spy = vi.spyOn(qc, 'invalidateQueries');

    await runViaDefaults(qc, ADD_SUPPORT_REPLY_KEY, {
      ticketId: 't42',
      body: { body: 'hi' },
    });

    // ticketId must come from the mutation variables so an offline reply can be
    // replayed from the defaults after a restart.
    expect(fns.addReply.mock.calls[0][0]).toEqual({ ticketId: 't42', body: { body: 'hi' } });
    const keys = invalidatedKeys(spy);
    expect(keys).toContain(JSON.stringify(['support', 'tickets']));
    expect(keys).toContain(JSON.stringify(['support', 'ticket', 't42']));
  });

  it('optimistically toggles the favorite in list + detail from the SET_FAVORITE default', async () => {
    const qc = new QueryClient();
    // Hold the network call open so we can observe the optimistic cache before it
    // settles (onSettled would otherwise invalidate right away).
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    registerStage3MutationDefaults(qc, {
      saveProgram: vi.fn(),
      addExercise: vi.fn(),
      setFavorite: vi.fn().mockImplementation(async () => {
        await gate;
        return {};
      }),
    });
    qc.setQueryData(['exercises', 'list', {}], {
      items: [{ id: 'e1', is_favorite: false }],
      total: 1,
    });
    qc.setQueryData(['exercises', 'detail', 'e1'], { id: 'e1', is_favorite: false });

    const observer = new MutationObserver<unknown, unknown, unknown>(qc, {
      mutationKey: [...SET_FAVORITE_KEY],
    });
    const promise = observer.mutate({ id: 'e1', isFavorite: true });
    // Let the async onMutate (cancelQueries + setQueriesData) run to completion.
    await vi.waitFor(() =>
      expect(
        (qc.getQueryData(['exercises', 'detail', 'e1']) as { is_favorite: boolean }).is_favorite,
      ).toBe(true),
    );

    // Optimistically flipped before the network settles.
    expect(
      (qc.getQueryData(['exercises', 'list', {}]) as { items: { is_favorite: boolean }[] }).items[0]
        .is_favorite,
    ).toBe(true);
    release();
    await promise;
  });

  it('rolls the favorite back when the SET_FAVORITE mutation errors', async () => {
    const qc = new QueryClient();
    registerStage3MutationDefaults(qc, {
      saveProgram: vi.fn(),
      addExercise: vi.fn(),
      setFavorite: vi.fn().mockRejectedValue(new Error('nope')),
    });
    qc.setQueryData(['exercises', 'detail', 'e1'], { id: 'e1', is_favorite: false });

    const observer = new MutationObserver<unknown, unknown, unknown>(qc, {
      mutationKey: [...SET_FAVORITE_KEY],
      retry: false,
    });
    await observer.mutate({ id: 'e1', isFavorite: true }).catch(() => {});

    expect(
      (qc.getQueryData(['exercises', 'detail', 'e1']) as { is_favorite: boolean }).is_favorite,
    ).toBe(false);
  });

  it('optimistically marks notifications read and drops the unread count from the MARK default', async () => {
    const qc = new QueryClient();
    registerNotificationSupport(qc);
    qc.setQueryData(['notifications', 'feed'], {
      items: [
        { id: 'n1', is_read: false },
        { id: 'n2', is_read: false },
      ],
      unread: 2,
    });

    const observer = new MutationObserver<unknown, unknown, unknown>(qc, {
      mutationKey: [...MARK_NOTIFICATIONS_READ_KEY],
    });
    const promise = observer.mutate({ notificationIds: ['n1'] });

    await vi.waitFor(() => {
      const f = qc.getQueryData(['notifications', 'feed']) as {
        items: { id: string; is_read: boolean }[];
      };
      expect(f.items.find((n) => n.id === 'n1')?.is_read).toBe(true);
    });
    const feed = qc.getQueryData(['notifications', 'feed']) as {
      items: { id: string; is_read: boolean }[];
      unread: number;
    };
    expect(feed.items.find((n) => n.id === 'n2')?.is_read).toBe(false);
    expect(feed.unread).toBe(1);
    await promise;
  });

  it('marks ALL notifications read when no ids are passed', async () => {
    const qc = new QueryClient();
    registerNotificationSupport(qc);
    qc.setQueryData(['notifications', 'feed'], {
      items: [
        { id: 'n1', is_read: false },
        { id: 'n2', is_read: false },
      ],
      unread: 2,
    });

    const observer = new MutationObserver<unknown, unknown, unknown>(qc, {
      mutationKey: [...MARK_NOTIFICATIONS_READ_KEY],
    });
    const promise = observer.mutate({});

    await vi.waitFor(() => {
      const f = qc.getQueryData(['notifications', 'feed']) as { items: { is_read: boolean }[] };
      expect(f.items.every((n) => n.is_read)).toBe(true);
    });
    const feed = qc.getQueryData(['notifications', 'feed']) as { unread: number };
    expect(feed.unread).toBe(0);
    await promise;
  });

  it('invalidates only the program list from the SAVE_PROGRAM default on create', async () => {
    const qc = new QueryClient();
    registerStage3MutationDefaults(qc, {
      saveProgram: vi.fn().mockResolvedValue({ id: 'new' }),
      addExercise: vi.fn(),
      setFavorite: vi.fn(),
    });
    const spy = vi.spyOn(qc, 'invalidateQueries');

    await runViaDefaults(qc, SAVE_PROGRAM_KEY, { body: {} });

    const keys = invalidatedKeys(spy);
    expect(keys).toContain(JSON.stringify(['programs', 'list']));
    expect(keys.some((k) => k.startsWith(JSON.stringify(['programs', 'detail'])))).toBe(false);
  });

  describe('bindOnlineManager', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('reflects verified network connectivity into onlineManager', async () => {
      resetNetworkStatusForTests();
      const onLineSpy = vi.spyOn(navigator, 'onLine', 'get');
      const unbind = bindOnlineManager();
      try {
        onLineSpy.mockReturnValue(false);
        window.dispatchEvent(new Event('offline'));
        expect(onlineManager.isOnline()).toBe(false);

        onLineSpy.mockReturnValue(true);
        window.dispatchEvent(new Event('online'));
        await waitFor(() => expect(onlineManager.isOnline()).toBe(true));
      } finally {
        unbind();
      }
    });

    it('stops updating onlineManager after the returned unsubscribe is called', async () => {
      resetNetworkStatusForTests();
      const onLineSpy = vi.spyOn(navigator, 'onLine', 'get');
      const unbind = bindOnlineManager();
      await waitFor(() => expect(onlineManager.isOnline()).toBe(true));
      unbind();

      // These events would flip onlineManager if the listeners were still bound.
      onLineSpy.mockReturnValue(false);
      window.dispatchEvent(new Event('offline'));
      expect(onlineManager.isOnline()).toBe(true);

      onLineSpy.mockReturnValue(true);
      window.dispatchEvent(new Event('online'));
      expect(onlineManager.isOnline()).toBe(true);
    });
  });
});
