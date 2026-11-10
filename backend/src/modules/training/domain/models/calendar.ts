// Calendar domain: personal and client bookings/events.
import type { Day, Id } from "./shared.js";

export interface Event {
  id: Id;
  owner_user_id: Id;
  owner_name: string;
  program_id: Id | null;
  program_name: string | null;
  date: Day;
  time: string;
  type: "personal" | "with_clients";
  status: "planned" | "completed" | "cancelled";
  workout_session_id: Id | null;
  clients: { client_id: Id; name: string }[];
}
export interface EventDraft {
  program_id: Id | null;
  date: Day;
  time: string;
  client_ids: Id[];
}
export interface EventChanges {
  program_id?: Id | null;
  date?: Day | null;
  time?: string | null;
  client_ids?: Id[] | null;
  status?: Event["status"] | null;
}
