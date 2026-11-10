export interface WorkoutVariant {
  variantId: string;
  exerciseId?: string | null; // catalog exercise id (null for custom exercises)
  name: string;
}

export interface WorkoutSlot {
  slotId: string;
  variantId: string; // chosen variant (defaults to primary)
  primaryVariantId?: string; // immutable; optional for drafts saved before this field existed
  exerciseId?: string | null; // catalog exercise id of the primary variant
  name: string;
  sets: number; // target sets
  reps: number; // target reps
  alternatives: WorkoutVariant[];
}

export interface LocalSet {
  id: string;
  slotId: string;
  variantId: string;
  weight: number;
  reps: number;
  performedAt: string; // ISO
}

export type Participant =
  { kind: 'self' } | { kind: 'client'; clientId: string; clientName: string };

export interface ActiveSession {
  sessionId: string; // UUID, used in the sync payload
  participant: Participant;
  programId: string;
  dayId: string;
  startedAt: string; // ISO — per-session, so timers run independently
  slots: WorkoutSlot[];
  sets: LocalSet[];
  completed: Record<string, boolean>;
  currentIndex: number;
}

/** Stable key for a session: 'self' for the trainer's own workout, client:<id> otherwise. */
export function sessionKeyFor(participant: Participant): string {
  return participant.kind === 'self' ? 'self' : `client:${participant.clientId}`;
}
