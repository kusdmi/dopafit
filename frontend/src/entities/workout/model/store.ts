import { primaryVariantId, workoutVariants } from './variants';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { kvPrefs } from '@/shared/lib/platform/storage/kv-prefs';
import { safeRandomUUID } from '@/shared/lib/uuid';

import type { ActiveSession, LocalSet, Participant, WorkoutSlot } from './types';
import { sessionKeyFor } from './types';

interface StartArgs {
  participant: Participant;
  programId: string;
  dayId: string;
  slots: WorkoutSlot[];
}

interface WorkoutState {
  sessions: Record<string, ActiveSession>;
  activeKey: string | null;
  startSession: (args: StartArgs) => void;
  switchTo: (sessionKey: string) => void;
  finishSession: (sessionKey: string) => ActiveSession | null;
  restorePrimaryVariants: (sessionKey: string, ids: Record<string, string>) => void;
  chooseVariant: (slotId: string, variantId: string) => void;
  addSet: (input: Omit<LocalSet, 'id' | 'performedAt'>) => void;
  editSet: (id: string, patch: { weight: number; reps: number }) => void;
  deleteSet: (id: string) => void;
  toggleComplete: (slotId: string) => void;
  setCurrentIndex: (index: number) => void;
  reset: () => void;
}

/** Apply `fn` to the active session immutably; no-op when there is no active session. */
function updateActive(
  state: WorkoutState,
  fn: (s: ActiveSession) => ActiveSession,
): Pick<WorkoutState, 'sessions'> | null {
  const key = state.activeKey;
  if (!key) return null;
  const current = state.sessions[key];
  if (!current) return null;
  return { sessions: { ...state.sessions, [key]: fn(current) } };
}

/**
 * Отмечает упражнение выполненным, когда записан плановый объём подходов.
 *
 * Тройное состояние `completed` здесь существенно: `true` — отмечено, `false` —
 * отметку СНЯЛИ вручную, отсутствие ключа — до упражнения ещё не дошли.
 * Автоотметка ставится только из третьего состояния, поэтому снятая вручную
 * галочка не возвращается сама на следующем же подходе — иначе снять её было бы
 * невозможно, ведь условие «подходов хватает» после этого остаётся истинным.
 */
function withAutoComplete(
  session: ActiveSession,
  sets: LocalSet[],
  slotId: string,
): Record<string, boolean> {
  if (slotId in session.completed) return session.completed;
  const slot = session.slots.find((sl) => sl.slotId === slotId);
  if (!slot || slot.sets <= 0) return session.completed;
  const done = sets.filter((x) => x.slotId === slotId).length;
  if (done < slot.sets) return session.completed;
  return { ...session.completed, [slotId]: true };
}

export const useWorkoutStore = create<WorkoutState>()(
  persist(
    (set) => ({
      sessions: {},
      activeKey: null,

      startSession: ({ participant, programId, dayId, slots }) =>
        set((state) => {
          const key = sessionKeyFor(participant);
          if (state.sessions[key]) {
            return { activeKey: key };
          }
          const session: ActiveSession = {
            sessionId: safeRandomUUID(),
            participant,
            programId,
            dayId,
            startedAt: new Date().toISOString(),
            slots: slots.map((slot) => ({ ...slot, primaryVariantId: primaryVariantId(slot) })),
            sets: [],
            completed: {},
            currentIndex: 0,
          };
          return { sessions: { ...state.sessions, [key]: session }, activeKey: key };
        }),

      switchTo: (sessionKey) =>
        set((state) => (state.sessions[sessionKey] ? { activeKey: sessionKey } : {})),

      finishSession: (sessionKey) => {
        let snapshot: ActiveSession | null = null;
        set((state) => {
          const session = state.sessions[sessionKey];
          if (!session) return {};
          snapshot = session;
          const rest = { ...state.sessions };
          delete rest[sessionKey];
          const nextKey =
            state.activeKey === sessionKey ? (Object.keys(rest)[0] ?? null) : state.activeKey;
          return { sessions: rest, activeKey: nextKey };
        });
        return snapshot;
      },

      restorePrimaryVariants: (key, ids) =>
        set((state) => {
          const session = state.sessions[key];
          if (!session) return {};
          const slots = session.slots.map((slot) =>
            !slot.primaryVariantId && ids[slot.slotId]
              ? { ...slot, primaryVariantId: ids[slot.slotId] }
              : slot,
          );
          if (slots.every((slot, i) => slot === session.slots[i])) return {};
          return { sessions: { ...state.sessions, [key]: { ...session, slots } } };
        }),

      chooseVariant: (slotId, variantId) =>
        set(
          (state) =>
            updateActive(state, (session) => ({
              ...session,
              slots: session.slots.map((slot) => {
                if (
                  slot.slotId !== slotId ||
                  !workoutVariants(slot, session.sets).some((v) => v.variantId === variantId)
                )
                  return slot;
                return {
                  ...slot,
                  primaryVariantId: primaryVariantId(slot, session.sets),
                  variantId,
                };
              }),
            })) ?? {},
        ),

      addSet: (input) =>
        set(
          (state) =>
            updateActive(state, (s) => {
              const sets = [
                ...s.sets,
                {
                  ...input,
                  id: safeRandomUUID(),
                  performedAt: new Date().toISOString(),
                },
              ];
              return { ...s, sets, completed: withAutoComplete(s, sets, input.slotId) };
            }) ?? {},
        ),

      editSet: (id, patch) =>
        set(
          (state) =>
            updateActive(state, (s) => ({
              ...s,
              sets: s.sets.map((x) => (x.id === id ? { ...x, ...patch } : x)),
            })) ?? {},
        ),

      deleteSet: (id) =>
        set(
          (state) =>
            updateActive(state, (s) => ({ ...s, sets: s.sets.filter((x) => x.id !== id) })) ?? {},
        ),

      toggleComplete: (slotId) =>
        set(
          (state) =>
            updateActive(state, (s) => ({
              ...s,
              completed: { ...s.completed, [slotId]: !s.completed[slotId] },
            })) ?? {},
        ),

      setCurrentIndex: (index) =>
        set((state) => updateActive(state, (s) => ({ ...s, currentIndex: index })) ?? {}),

      reset: () => set({ sessions: {}, activeKey: null }),
    }),
    {
      name: 'dopafit.workout',
      storage: createJSONStorage(() => kvPrefs),
      merge: (persisted, current) => {
        const saved = persisted as Partial<WorkoutState> | undefined;
        const sessions = Object.fromEntries(
          Object.entries(saved?.sessions ?? {}).map(([key, session]) => [
            key,
            {
              ...session,
              slots: session.slots.map((slot) => ({
                ...slot,
                primaryVariantId: primaryVariantId(slot, session.sets),
              })),
            },
          ]),
        );
        return { ...current, sessions, activeKey: saved?.activeKey ?? null };
      },
    },
  ),
);
