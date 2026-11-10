// Programs domain: workout program templates, days, slots and exercise variants.
import type { Id, Instant } from "./shared.js";

export type ProgramKind = "strength" | "functional" | "cardio" | "plyometric" | "custom";
export interface VariantDraft {
  id?: Id | null;
  exercise_id: Id | null;
  custom_name: string | null;
  sets: number;
  reps: number;
  variant_order: number;
}
export interface SlotDraft {
  id?: Id | null;
  position: number;
  exercises: VariantDraft[];
}
export interface DayDraft {
  id?: Id | null;
  name: string;
  position: number;
  slots: SlotDraft[];
}
export interface ProgramDraft {
  id?: Id | null;
  name: string;
  kind: ProgramKind;
  days: DayDraft[];
}
export interface Variant extends VariantDraft {
  id: Id;
  slot_id: Id;
  deleted_at: Instant | null;
  name: string;
  has_contraindications: boolean;
}
export interface HistoryVariant extends Variant {
  program_owner_id: Id | null;
}
export interface ProgramSlot {
  id: Id;
  day_id: Id;
  position: number;
  deleted_at: Instant | null;
  exercises: Variant[];
}
export interface ProgramDay {
  id: Id;
  program_id: Id;
  name: string;
  position: number;
  deleted_at: Instant | null;
  slots: ProgramSlot[];
}
export interface Program {
  assigned_by: Id | null;
  assigned_client_id: Id | null;
  id: Id;
  owner_id: Id | null;
  name: string;
  kind: ProgramKind;
  deleted_at: Instant | null;
  updated_at: Instant;
  source_program_id: Id | null;
  source_author_name: string | null;
  for_trainer_client_id: Id | null;
  for_client_name: string | null;
  days: ProgramDay[];
}
export type ProgramListSummary = Pick<
  Program,
  | "id"
  | "owner_id"
  | "assigned_by"
  | "name"
  | "kind"
  | "updated_at"
  | "for_trainer_client_id"
  | "for_client_name"
> & { day_count: number; exercise_count: number };
