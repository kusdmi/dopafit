import type { QueryClient } from '@tanstack/react-query';
import { onlineManager } from '@tanstack/react-query';

import { subscribeNetworkStatus, getNetworkSnapshot } from '../network/useNetworkStatus';

import { isRetriableFailure, persistFailedMutation } from './failed-mutations';
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

/**
 * Bridges navigator online/offline events into TanStack's onlineManager.
 * Returns an unsubscribe function that removes both listeners (mirrors the
 * pattern used by shared/lib/platform/network.ts, theme.ts, keyboard.ts and
 * use-drain-photo-queue.ts — every other window-listener setup in the
 * codebase returns its own teardown).
 */
export function bindOnlineManager(): () => void {
  if (typeof window === 'undefined') return () => {};
  onlineManager.setEventListener(() => () => {});
  const update = () => onlineManager.setOnline(getNetworkSnapshot());
  const unsubscribe = subscribeNetworkStatus(update);
  update();
  return unsubscribe;
}

/**
 * Registers mutation defaults for creating AND updating measurements so paused
 * (offline) mutations for either key survive a hard reload + resumePausedMutations().
 *
 * Two rules hold for every helper in this file. The mutationFns are injected by the
 * app layer (App.tsx) rather than imported here, and query keys are plain literals:
 * setupOffline lives in `shared`, which must not import from `entities` (FSD
 * layering). And invalidations live HERE, not only in the hooks, because a hook's
 * onSuccess/onSettled is dropped on dehydrate — only the defaults' callbacks run
 * when a paused mutation is replayed after a restart.
 *
 * The whole ['analytics'] prefix is invalidated (analytics charts read a separate
 * key) so an edited measurement surfaces on the chart without a manual refetch.
 */
export function registerMeasurementMutationDefaults(
  queryClient: QueryClient,
  fns: {
    save: (variables: unknown) => Promise<unknown>;
    update: (variables: unknown) => Promise<unknown>;
  },
): void {
  queryClient.setMutationDefaults([...SAVE_MEASUREMENT_KEY], {
    mutationFn: fns.save,
    scope: { id: 'measurement-writes' },
    retry: (count, error) => count < 3 && isRetriableFailure(error),
    onError: (error, variables) => {
      persistFailedMutation(SAVE_MEASUREMENT_KEY, variables, 'Замер', error);
    },
    // Also reached by a manual retry of a stranded SAVE, which runs these
    // defaults' callbacks via useRetryFailedMutation.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['measurements', 'list'] });
      void queryClient.invalidateQueries({ queryKey: ['analytics'] });
    },
  });
  queryClient.setMutationDefaults([...UPDATE_MEASUREMENT_KEY], {
    mutationFn: fns.update,
    scope: { id: 'measurement-writes' },
    retry: (count, error) => count < 3 && isRetriableFailure(error),
    onSuccess: (data) => {
      // A date move changes the history row itself. Invalidating in onSettled
      // can race a reload, which then restores the old row from persisted cache.
      const updated = data as { id: string; date: string };
      queryClient.setQueryData(['measurements', updated.id], data);
      queryClient.setQueryData<{ items: { id: string; date: string }[]; total: number }>(
        ['measurements', 'list'],
        (page) =>
          page
            ? {
                ...page,
                items: page.items
                  .map((item) => (item.id === updated.id ? { ...item, ...updated } : item))
                  .sort((a, b) => b.date.localeCompare(a.date)),
              }
            : page,
      );
    },
    onError: (error, variables) => {
      persistFailedMutation(UPDATE_MEASUREMENT_KEY, variables, 'Замер', error);
    },
    onSettled: (_data, _error, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['measurements', 'list'] });
      void queryClient.invalidateQueries({ queryKey: ['analytics'] });
      const measurementId = (vars as { measurementId?: string } | undefined)?.measurementId;
      if (measurementId) {
        void queryClient.invalidateQueries({ queryKey: ['measurements', measurementId] });
      }
    },
  });
}

/**
 * Registers mutation defaults for the stage-3 (program/favorite) mutations so that
 * paused (offline) mutations survive a hard reload + resumePausedMutations().
 */
export function registerStage3MutationDefaults(
  queryClient: QueryClient,
  fns: {
    saveProgram: (vars: unknown) => Promise<unknown>;
    addExercise: (vars: unknown) => Promise<unknown>;
    setFavorite: (vars: unknown) => Promise<unknown>;
  },
): void {
  queryClient.setMutationDefaults([...SAVE_PROGRAM_KEY], {
    mutationFn: fns.saveProgram,
    retry: (failureCount, error) => failureCount < 3 && isRetriableFailure(error),
    onError: (error, variables) => {
      persistFailedMutation(SAVE_PROGRAM_KEY, variables, 'Программа', error);
    },
    // On update (programId present) the detail key must be invalidated too,
    // otherwise an already-mounted ProgramDetailPage / StartWorkoutPage keep
    // stale days/slots.
    onSettled: (_data, _error, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['programs', 'list'] });
      const programId = (vars as { programId?: string } | undefined)?.programId;
      if (programId) {
        void queryClient.invalidateQueries({ queryKey: ['programs', 'detail', programId] });
      }
    },
  });
  queryClient.setMutationDefaults([...ADD_EXERCISE_TO_PROGRAM_KEY], {
    mutationFn: fns.addExercise,
    retry: 3,
  });
  queryClient.setMutationDefaults([...SET_FAVORITE_KEY], {
    mutationFn: fns.setFavorite,
    retry: 3,
    // Optimistic toggle so the star flips instantly — including offline, where
    // the mutation is paused and onSettled won't fire until replay.
    onMutate: async (vars) => {
      const { id, isFavorite } = vars as { id: string; isFavorite: boolean };
      await queryClient.cancelQueries({ queryKey: ['exercises'] });
      const listSnapshots = queryClient.getQueriesData<{
        items?: { id: string; is_favorite: boolean }[];
      }>({ queryKey: ['exercises', 'list'] });
      const detailSnapshot = queryClient.getQueryData(['exercises', 'detail', id]);
      queryClient.setQueriesData<{ items?: { id: string; is_favorite: boolean }[] }>(
        { queryKey: ['exercises', 'list'] },
        (page) =>
          page?.items
            ? {
                ...page,
                items: page.items.map((it) =>
                  it.id === id ? { ...it, is_favorite: isFavorite } : it,
                ),
              }
            : page,
      );
      queryClient.setQueryData<{ is_favorite?: boolean }>(['exercises', 'detail', id], (ex) =>
        ex ? { ...ex, is_favorite: isFavorite } : ex,
      );
      return { listSnapshots, detailSnapshot, id };
    },
    onError: (_err, _vars, context) => {
      const ctx = context as
        | { listSnapshots?: [readonly unknown[], unknown][]; detailSnapshot?: unknown; id?: string }
        | undefined;
      ctx?.listSnapshots?.forEach(([key, data]) => queryClient.setQueryData(key, data));
      if (ctx?.id !== undefined) {
        queryClient.setQueryData(['exercises', 'detail', ctx.id], ctx.detailSnapshot);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['exercises', 'list'] });
      void queryClient.invalidateQueries({ queryKey: ['exercises', 'detail'] });
    },
  });
}

/**
 * Registers mutation defaults for the notification + support mutations so paused
 * (offline) mutations for these keys survive a hard reload + resumePausedMutations().
 * Without a registered default (mutationFn) TanStack cannot resume a dehydrated
 * mutation and silently drops it, losing the user's action forever.
 *
 * addSupportReply reads ticketId from the mutation VARIABLES (AddReplyVars), not
 * a hook closure, so a replayed offline reply still targets the right ticket.
 */
export function registerNotificationSupportMutationDefaults(
  queryClient: QueryClient,
  fns: {
    markRead: (vars: unknown) => Promise<unknown>;
    saveNotificationSettings: (vars: unknown) => Promise<unknown>;
    createTicket: (vars: unknown) => Promise<unknown>;
    addReply: (vars: unknown) => Promise<unknown>;
  },
): void {
  queryClient.setMutationDefaults([...MARK_NOTIFICATIONS_READ_KEY], {
    mutationFn: fns.markRead,
    retry: 3,
    // Optimistic mark-read so the badge/count drop instantly — including offline,
    // where the mutation is paused. Undefined ids => mark all.
    onMutate: async (vars) => {
      const { notificationIds } = (vars ?? {}) as { notificationIds?: string[] };
      await queryClient.cancelQueries({ queryKey: ['notifications', 'feed'] });
      const previous = queryClient.getQueryData(['notifications', 'feed']);
      queryClient.setQueryData<{ items?: { id: string; is_read: boolean }[]; unread?: number }>(
        ['notifications', 'feed'],
        (page) => {
          if (!page?.items) return page;
          const targets = notificationIds ? new Set(notificationIds) : null;
          let cleared = 0;
          const items = page.items.map((n) => {
            if ((targets === null || targets.has(n.id)) && !n.is_read) {
              cleared += 1;
              return { ...n, is_read: true };
            }
            return n;
          });
          const unread = Math.max(0, (page.unread ?? 0) - cleared);
          return { ...page, items, unread };
        },
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      const ctx = context as { previous?: unknown } | undefined;
      if (ctx && 'previous' in ctx) {
        queryClient.setQueryData(['notifications', 'feed'], ctx.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications', 'feed'] });
    },
  });
  queryClient.setMutationDefaults([...SAVE_NOTIFICATION_SETTINGS_KEY], {
    mutationFn: fns.saveNotificationSettings,
    retry: 3,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications', 'settings'] });
    },
  });
  queryClient.setMutationDefaults([...CREATE_SUPPORT_TICKET_KEY], {
    mutationFn: fns.createTicket,
    retry: 3,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['support', 'tickets'] });
    },
  });
  queryClient.setMutationDefaults([...ADD_SUPPORT_REPLY_KEY], {
    mutationFn: fns.addReply,
    retry: 3,
    onSettled: (_data, _error, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['support', 'tickets'] });
      const ticketId = (vars as { ticketId?: string } | undefined)?.ticketId;
      if (ticketId) {
        void queryClient.invalidateQueries({ queryKey: ['support', 'ticket', ticketId] });
      }
    },
  });
}

/**
 * Registers mutation defaults for the workout session-sync mutation so paused
 * (offline) syncs survive a hard reload + resumePausedMutations(). The whole
 * ['workouts', 'history'] prefix is invalidated so every exercise touched by the
 * session (each set carries its own variant_id) is refreshed without enumerating
 * them; already-open calendar/analytics/history screens do not refetch on their
 * own.
 */
export function registerWorkoutMutationDefaults<TData, TVariables>(
  queryClient: QueryClient,
  syncSession: (variables: TVariables) => Promise<TData>,
): void {
  queryClient.setMutationDefaults([...SYNC_WORKOUT_KEY], {
    mutationFn: syncSession as (variables: unknown) => Promise<unknown>,
    retry: 3,
    // A workout sync that finally errors (e.g. replay on a half-up network after a
    // cold boot) must not vanish from the outbox — persist it for manual retry.
    onError: (error, variables) => {
      persistFailedMutation(SYNC_WORKOUT_KEY, variables, 'Тренировка', error);
    },
    onSuccess: (_summary, variables) => {
      const sessionId = (variables as { id?: string } | undefined)?.id;
      if (sessionId) {
        // The summary page may have fetched before the queued sync reached the
        // server. Re-fetch it after sync so the local #0 becomes the server number.
        void queryClient.invalidateQueries({ queryKey: ['workouts', 'summary', sessionId] });
      }
      void queryClient.invalidateQueries({ queryKey: ['analytics'] });
      void queryClient.invalidateQueries({ queryKey: ['calendar'] });
      void queryClient.invalidateQueries({ queryKey: ['workouts', 'history'] });
      // Client sessions bump the client's last_activity / workout_count.
      void queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}
