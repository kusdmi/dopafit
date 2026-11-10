// Catalog domain: exercises, categories and their media.
import type { Id, Instant } from "./shared.js";

export type Difficulty = "beginner" | "intermediate" | "advanced";
/** How an exercise relates to the caller: their own, shared with them, or part of the catalog. */
export type Ownership = "own" | "shared" | "global";
export interface ExerciseDraft {
  name: string;
  category_id: Id;
  difficulty: Difficulty;
  description: string;
  steps: string[];
  alt_names: string[];
  contraindications: string | null;
}
export interface Exercise extends ExerciseDraft {
  id: Id;
  owner_id: Id | null;
  deleted_at: Instant | null;
  is_favorite: boolean;
  is_shared: boolean;
}
export interface Category {
  id: Id;
  name: string;
  slug: string;
  emoji: string;
  image_url: string | null;
  exercise_count: number;
}
export type MediaKind = "image" | "gif" | "video" | "iframe";
/**
 * Where a media item's bytes come from: an external link, or an object we uploaded.
 * The `exercise_media` table enforces this as a check constraint —
 * `CHECK ((object_key IS NULL) <> (url IS NULL))` — so a row carrying neither, or both,
 * cannot exist. Modelling it as a union rather than two independently nullable fields
 * makes that invariant visible to the compiler, and the resolved URL non-nullable.
 */
export type MediaSource = { url: string; object_key?: never } | { object_key: string; url?: never };
export type MediaDraft = {
  exercise_id: Id;
  kind: MediaKind;
  position: number;
} & MediaSource;
export type Media = MediaDraft & { id: Id };
