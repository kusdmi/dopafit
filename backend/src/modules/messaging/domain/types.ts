export type NotificationType =
  | "workout_reminder"
  | "subscription"
  | "referral"
  | "support"
  | "system"
  | "link_request"
  | "account";
export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  payload: Record<string, unknown> | null;
  is_read: boolean;
  created_at: Date;
}
export interface PushMessage {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown> | null;
}
export interface PushToken {
  id: string;
  user_id: string;
  token: string;
  platform: string;
  p256dh: string | null;
  auth: string | null;
}
export interface Settings {
  push_enabled: boolean;
  workout_reminders: boolean;
  measurement_reminders: boolean;
  progress_updates: boolean;
  weekly_reports: boolean;
  motivational: boolean;
  new_features: boolean;
}
export const defaultSettings = (): Settings => ({
  push_enabled: true,
  workout_reminders: true,
  measurement_reminders: true,
  progress_updates: true,
  weekly_reports: false,
  motivational: true,
  new_features: false,
});
const toggle: Record<NotificationType, keyof Settings | null> = {
  workout_reminder: "workout_reminders",
  subscription: "progress_updates",
  referral: "progress_updates",
  support: null,
  system: "new_features",
  link_request: null,
  account: null,
};
export function deliveryEnabled(settings: Settings, type: NotificationType): boolean {
  return settings.push_enabled && (toggle[type] === null || settings[toggle[type]]);
}
export interface Ticket {
  id: string;
  user_id: string;
  subject: string;
  message: string;
  status: "open" | "answered" | "closed";
  created_at: Date;
}
export interface Reply {
  id: string;
  author: "user" | "admin";
  body: string;
  created_at: Date;
}
export interface Repository {
  listNotifications(
    userId: string,
    limit: number,
    offset: number,
  ): Promise<{ items: Notification[]; total: number; unread: number }>;
  markRead(userId: string, ids: string[] | null): Promise<void>;
  getSettings(userId: string): Promise<Settings | null>;
  saveSettings(userId: string, settings: Settings): Promise<void>;
  registerToken(
    userId: string,
    token: string,
    platform: string,
    keys: { p256dh: string; auth: string } | null,
  ): Promise<void>;
  tokens(userId: string): Promise<PushToken[]>;
  evictToken(token: PushToken): Promise<void>;
  createTicket(userId: string, subject: string, message: string): Promise<Ticket>;
  listTickets(userId: string): Promise<Ticket[]>;
  getTicket(id: string): Promise<Ticket | null>;
  listReplies(ticketId: string): Promise<Reply[]>;
  replyToTicket(ticketId: string, body: string): Promise<void>;
  activeUnverified(): Promise<{ id: string; verification_deadline_at: Date }[]>;
  createNotification(message: PushMessage): Promise<void>;
  housekeeping(now: Date): Promise<{ tokens: number; codes: number }>;
  claimTask(name: string, runDate: string, now: Date): Promise<string | null>;
  finishTask(
    id: string,
    status: "success" | "failed",
    detail: string | null,
    now: Date,
  ): Promise<void>;
  reapStaleTasks(cutoff: Date, now: Date): Promise<number>;
}
export interface UnitOfWork {
  run<T>(work: (repository: Repository) => Promise<T>): Promise<T>;
}
export interface PushProvider {
  send(input: {
    token: string;
    platform: string;
    keys: { p256dh: string; auth: string } | null;
    title: string;
    body: string;
    data?: Record<string, unknown> | null;
  }): Promise<boolean>;
}
export interface Config {
  pushProvider?: PushProvider;
  now?: () => Date;
  onIntegrationError?: (error: unknown) => void;
  anonymizeOverdue?: (userId: string) => Promise<boolean>;
  staleRunHours?: number;
}
