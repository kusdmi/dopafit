// Clients domain: trainer-client relationships and link requests.
import type { Day, Id, Instant, Role } from "./shared.js";

export interface Account {
  id: Id;
  role: Role;
  phone: string | null;
  full_name: string;
  injuries: string | null;
}
export interface ClientCard {
  id: Id;
  trainer_id: Id;
  user_id: Id | null;
  managed_client_id: Id | null;
  status: "active" | "archived" | "unlinked";
  start_date: Day;
  end_date: Day | null;
  note: string | null;
  display_name: string;
  full_name: string | null;
  phone: string | null;
  injuries: string | null;
  workout_count: number;
  last_activity_at: Instant | null;
}
export interface ClientDraft {
  display_name: string;
  phone?: string | null;
  injuries?: string | null;
  start_date?: Day | null;
  note?: string | null;
}
export interface ClientChanges {
  display_name?: string | null;
  phone?: string | null;
  injuries?: string | null;
  start_date?: Day | null;
  end_date?: Day | null;
}
/**
 * The active link as the client sees it — the one view of the pair that is not the trainer's.
 *
 * `ClientCard` answers "who are my clients"; this answers "who is my trainer", and carries
 * only the trainer's own identity and the date the link opened.
 */
export interface TrainerLink {
  card_id: Id;
  trainer_user_id: Id;
  full_name: string | null;
  phone: string | null;
  linked_since: Day;
}
export interface LinkRequest {
  id: Id;
  from_user_id: Id;
  to_user_id: Id;
  status: "pending" | "accepted" | "declined" | "cancelled";
  created_at: Instant;
}
export interface AccessPeriod {
  start_date: Instant;
  end_date: Instant | null;
}
