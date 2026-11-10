import { useCallback, useState } from 'react';
import { useNavigation } from '@/shared/lib/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { persistOfflineState } from '@/shared/lib/query/persistQueryClient';

import { useSyncSession } from '@/entities/workout/api/use-sync-session';
import { sessionSummaryKey } from '@/entities/workout/api/use-session-summary';
import { useWorkoutStore } from '@/entities/workout/model/store';
import { computeLocalSummary } from '@/entities/workout/model/summary';
import type { components } from '@/shared/api/schema';
import { workoutSummary } from '@/shared/config/paths';
import { useNetworkStatus } from '@/shared/lib/network/useNetworkStatus';
import { fieldError, weightSchema, repsSchema } from '@/shared/lib/validation/training';
import { trainingError } from '@/shared/lib/validation/training-errors';
import { localDateKey } from '@/shared/lib/time/localDateKey';

type SessionSyncRequest = components['schemas']['SessionSyncRequest'];
type SessionSummaryOut = components['schemas']['SessionSummaryOut'];

export interface UseFinishWorkout {
  /** Whether the finish confirmation dialog is open. */
  finishOpen: boolean;
  /** Failure explanation; the active session stays intact for correction or retry. */
  finishError: string | null;
  /** True while the sync mutation is in flight. */
  pending: boolean;
  /** Opens the finish confirmation dialog. */
  openFinish: () => void;
  /** Closes the finish confirmation dialog without finishing. */
  cancelFinish: () => void;
  /**
   * Collects the active session into a sync payload, dispatches the mutation,
   * removes the session from the store and navigates to the summary. Handles the
   * offline (paused/queued mutation with a locally computed summary) and online
   * (server summary on success, error surfaced on failure) branches.
   */
  confirmFinish: () => void;
}

/**
 * Orchestrates finishing the currently active workout session, so the page only
 * renders and wires callbacks. Covers the parallel-client-session case where
 * another session remains active after the current one is finished (the dialog
 * must close, not linger).
 *
 * Invalidations are owned by the sync mutation defaults (setupOffline.ts) and are
 * intentionally not repeated here.
 */
export function useFinishWorkout(): UseFinishWorkout {
  const router = useNavigation();
  const finishSession = useWorkoutStore((s) => s.finishSession);
  const sync = useSyncSession();
  const { isOffline } = useNetworkStatus();

  const [finishOpen, setFinishOpen] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  const openFinish = useCallback(() => setFinishOpen(true), []);
  const cancelFinish = useCallback(() => setFinishOpen(false), []);

  const queryClient = useQueryClient();
  const confirmFinish = useCallback(async () => {
    // Read the active session directly from the store. finishSession removes this
    // session afterwards, so everything the payload/summary/navigation needs must
    // be captured from these values BEFORE finishing.
    const state = useWorkoutStore.getState();
    const activeKeySnapshot = state.activeKey;
    if (!activeKeySnapshot) return;
    const active = state.sessions[activeKeySnapshot];
    if (!active) return;

    const capturedSessionId = active.sessionId;
    const capturedProgramId = active.programId;
    const capturedDayId = active.dayId;
    const capturedStartedAt = active.startedAt;
    const capturedSlots = active.slots;
    const capturedSets = active.sets;
    const capturedCompleted = active.completed;
    const clientId = active.participant.kind === 'client' ? active.participant.clientId : null;
    const finishedAt = new Date().toISOString();

    const payload: SessionSyncRequest = {
      id: capturedSessionId,
      program_id: capturedProgramId,
      day_id: capturedDayId,
      client_id: clientId,
      started_at: capturedStartedAt,
      finished_at: finishedAt,
      // Client-local calendar date of the session, used server-side for all day
      // grouping. It MUST be derived from the START instant captured on-device at
      // session start (not `now`): an offline finish replays after reconnect, which
      // may be a different day, and the backend rejects |local_date − started_at UTC
      // date| > 2 days. Anchoring to startedAt keeps them within range on replay.
      local_date: localDateKey(new Date(capturedStartedAt)),
      exercises: capturedSlots.map((s) => ({
        slot_id: s.slotId,
        chosen_variant_id: s.variantId,
        is_completed: !!capturedCompleted[s.slotId],
      })),
      sets: capturedSets.map((s) => ({
        id: s.id,
        slot_id: s.slotId,
        variant_id: s.variantId,
        weight: s.weight,
        reps: s.reps,
        performed_at: s.performedAt,
      })),
    };

    const invalidSets = capturedSets.flatMap((set, index) => {
      const errors = [
        fieldError(weightSchema, set.weight),
        fieldError(repsSchema, set.reps),
      ].filter(Boolean);
      return errors.length ? [`Подход ${index + 1}: ${errors.join('; ')}`] : [];
    });
    if (invalidSets.length) {
      setFinishError(invalidSets.join('; '));
      setFinishOpen(false);
      return;
    }
    setFinishError(null);
    if (isOffline) {
      // Offline: TanStack pauses the mutation; it is queued in the outbox and
      // replays on reconnect (server assigns the real seq_number then). We do
      // not await it. Show a locally computed summary so data is never lost.
      sync.mutate(payload);
      const local = computeLocalSummary({
        startedAt: capturedStartedAt,
        finishedAt,
        slots: capturedSlots,
        sets: capturedSets,
      });
      const summary: SessionSummaryOut = {
        session_id: capturedSessionId,
        seq_number: 0, // unknown offline; server assigns on replay
        finished_at: finishedAt,
        duration_seconds: local.durationSeconds,
        avg_rest_seconds: local.avgRestSeconds,
        exercises: local.exercises.map((e) => ({
          name: e.name,
          max: { value: e.max, delta: null },
          avg: { value: e.avg, delta: null },
          min: { value: e.min, delta: null },
        })),
      };
      const summaryKey = sessionSummaryKey(capturedSessionId);
      queryClient.setQueryData(summaryKey, summary);
      try {
        await persistOfflineState(queryClient);
      } catch {
        queryClient.removeQueries({ queryKey: summaryKey });
        setFinishError('Не удалось сохранить тренировку на устройстве. Повторите попытку.');
        return;
      }
      // The queued mutation owns its payload by value, so removing this session is
      // safe and prevents a stale "active" session lingering behind navigation.
      finishSession(activeKeySnapshot);
      setFinishOpen(false);
      router.push(workoutSummary(capturedSessionId), { summary });
      return;
    }

    // Online: navigate on success with the server summary; on error keep the
    // store intact so the user can retry, and surface a message.
    setFinishError(null);
    // Capture where the user is finishing from. If the network drops mid-flight the
    // SYNC_WORKOUT mutation pauses and replays on reconnect; this observer, if still
    // mounted, would otherwise fire a late router.push to the summary from wherever
    // the user has since navigated. Only navigate if the user is still on the page
    // they started the finish from — the mutation defaults own the cache
    // invalidations, so skipping the push loses nothing.
    const originPath = router.location.pathname;
    sync.mutate(payload, {
      onSuccess: (summary) => {
        queryClient.setQueryData(sessionSummaryKey(capturedSessionId), summary);
        finishSession(activeKeySnapshot);
        setFinishOpen(false);
        if (router.location.pathname !== originPath) return;
        router.push(workoutSummary(capturedSessionId), { summary });
      },
      onError: (error) => {
        setFinishError(trainingError(error, undefined, payload).message);
        setFinishOpen(false);
      },
    });
  }, [finishSession, isOffline, router, sync, queryClient]);

  return {
    finishOpen,
    finishError,
    pending: sync.isPending,
    openFinish,
    cancelFinish,
    confirmFinish,
  };
}
