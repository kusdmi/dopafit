import { useContext, createContext } from 'react';
import { useStore, type StoreApi } from 'zustand';
import { createStore } from 'zustand/vanilla';

import type { components } from '@/shared/api/schema';
import { safeRandomUUID } from '@/shared/lib/uuid';

type ProgramKind = components['schemas']['ProgramKind'];

export interface DraftSlotExercise {
  id: string;
  exercise_id: string | null;
  custom_name: string | null;
  name: string;
  sets: number;
  reps: number;
  variant_order: number;
}

export interface DraftSlot {
  id: string;
  position: number;
  exercises: DraftSlotExercise[];
}

export interface DraftDay {
  id: string;
  name: string;
  position: number;
  slots: DraftSlot[];
}

export interface DraftProgram {
  id: string;
  name: string;
  kind: ProgramKind;
  days: DraftDay[];
  /** True when this draft was seeded from a standard program (fork-on-save). */
  fromStandard: boolean;
}

export const MAX_DAYS = 7;
const MAX_VARIANTS = 6;

function uuid(): string {
  return safeRandomUUID();
}

interface NewExerciseInput {
  exercise_id: string | null;
  custom_name: string | null;
  name: string;
  sets: number;
  reps: number;
}

interface BuilderState {
  draft: DraftProgram;
  initEmpty: (kind?: ProgramKind) => void;
  initFromProgram: (program: components['schemas']['ProgramOut']) => void;
  setName: (name: string) => void;
  addDay: (name: string) => void;
  renameDay: (dayId: string, name: string) => void;
  removeDay: (dayId: string) => void;
  addExercise: (dayId: string, input: NewExerciseInput) => void;
  addAlternative: (dayId: string, slotId: string, input: NewExerciseInput) => void;
  updateSlotExercise: (
    dayId: string,
    slotId: string,
    slotExerciseId: string,
    values: Pick<DraftSlotExercise, 'sets' | 'reps'>,
  ) => void;
  removeSlotExercise: (dayId: string, slotId: string, slotExerciseId: string) => void;
  moveSlot: (fromDayId: string, toDayId: string, fromIndex: number, toIndex: number) => void;
}

function emptyDraft(kind: ProgramKind): DraftProgram {
  return { id: uuid(), name: '', kind, days: [], fromStandard: false };
}

function reindex<T extends { position: number }>(items: T[]): T[] {
  return items.map((item, i) => ({ ...item, position: i }));
}

export const createBuilderStore = () =>
  createStore<BuilderState>((set) => ({
    draft: emptyDraft('strength'),

    initEmpty: (kind = 'strength') => set({ draft: emptyDraft(kind) }),

    initFromProgram: (program) => {
      const fresh = program.is_standard === true || program.is_received === true;
      set({
        draft: {
          id: fresh ? uuid() : program.id,
          name: program.name,
          kind: program.kind,
          fromStandard: fresh,
          days: program.days.map((d) => ({
            id: fresh ? uuid() : d.id,
            name: d.name,
            position: d.position,
            slots: d.slots.map((s) => ({
              id: fresh ? uuid() : s.id,
              position: s.position,
              exercises: s.exercises.map((e) => ({
                id: fresh ? uuid() : e.id,
                exercise_id: e.exercise_id ?? null,
                custom_name: e.exercise_id ? null : e.name,
                name: e.name,
                sets: e.sets,
                reps: e.reps,
                variant_order: e.variant_order,
              })),
            })),
          })),
        },
      });
    },

    setName: (name) => set((st) => ({ draft: { ...st.draft, name } })),

    addDay: (name) =>
      set((st) => {
        if (st.draft.days.length >= MAX_DAYS) return st;
        const days = reindex([
          ...st.draft.days,
          { id: uuid(), name, position: st.draft.days.length, slots: [] },
        ]);
        return { draft: { ...st.draft, days } };
      }),

    renameDay: (dayId, name) =>
      set((st) => ({
        draft: {
          ...st.draft,
          days: st.draft.days.map((d) => (d.id === dayId ? { ...d, name } : d)),
        },
      })),

    removeDay: (dayId) =>
      set((st) => ({
        draft: {
          ...st.draft,
          days: reindex(st.draft.days.filter((d) => d.id !== dayId)),
        },
      })),

    addExercise: (dayId, input) =>
      set((st) => ({
        draft: {
          ...st.draft,
          days: st.draft.days.map((d) => {
            if (d.id !== dayId) return d;
            const slots = reindex([
              ...d.slots,
              {
                id: uuid(),
                position: d.slots.length,
                exercises: [{ id: uuid(), ...input, variant_order: 0 }],
              },
            ]);
            return { ...d, slots };
          }),
        },
      })),

    addAlternative: (dayId, slotId, input) =>
      set((st) => ({
        draft: {
          ...st.draft,
          days: st.draft.days.map((d) => {
            if (d.id !== dayId) return d;
            return {
              ...d,
              slots: d.slots.map((s) => {
                if (s.id !== slotId || s.exercises.length >= MAX_VARIANTS) return s;
                const variant_order = s.exercises.length;
                return {
                  ...s,
                  exercises: [...s.exercises, { id: uuid(), ...input, variant_order }],
                };
              }),
            };
          }),
        },
      })),

    updateSlotExercise: (dayId, slotId, slotExerciseId, values) =>
      set((st) => ({
        draft: {
          ...st.draft,
          days: st.draft.days.map((day) =>
            day.id === dayId
              ? {
                  ...day,
                  slots: day.slots.map((slot) =>
                    slot.id === slotId
                      ? {
                          ...slot,
                          exercises: slot.exercises.map((exercise) =>
                            exercise.id === slotExerciseId ? { ...exercise, ...values } : exercise,
                          ),
                        }
                      : slot,
                  ),
                }
              : day,
          ),
        },
      })),

    removeSlotExercise: (dayId, slotId, slotExerciseId) =>
      set((st) => ({
        draft: {
          ...st.draft,
          days: st.draft.days.map((d) => {
            if (d.id !== dayId) return d;
            const slots = d.slots
              .map((s) => {
                if (s.id !== slotId) return s;
                const exercises = s.exercises
                  .filter((e) => e.id !== slotExerciseId)
                  .map((e, i) => ({ ...e, variant_order: i })); // keep one primary (index 0)
                return { ...s, exercises };
              })
              .filter((s) => s.exercises.length > 0);
            return { ...d, slots: reindex(slots) };
          }),
        },
      })),

    moveSlot: (fromDayId, toDayId, fromIndex, toIndex) =>
      set((st) => {
        const days = st.draft.days.map((d) => ({ ...d, slots: [...d.slots] }));
        const from = days.find((d) => d.id === fromDayId);
        const to = days.find((d) => d.id === toDayId);
        if (!from || !to) return st;
        const [moved] = from.slots.splice(fromIndex, 1);
        if (!moved) return st;
        to.slots.splice(toIndex, 0, moved);
        from.slots = reindex(from.slots);
        to.slots = reindex(to.slots);
        return { draft: { ...st.draft, days } };
      }),
  }));

const defaultStore = createBuilderStore();
export const BuilderStoreContext = createContext<StoreApi<BuilderState> | null>(null);
export function useBuilderApi() {
  return useContext(BuilderStoreContext) ?? defaultStore;
}
export const useBuilderStore = Object.assign(function useBuilderStore<T>(
  selector: (state: BuilderState) => T,
): T {
  return useStore(useBuilderApi(), selector);
}, defaultStore);
