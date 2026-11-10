import { and, asc, count, desc, eq, inArray, isNotNull, isNull, lte, lt, or } from "drizzle-orm";
import type { Database } from "../../../platform/db/index.js";
import {
  notification_settings,
  notifications,
  push_tokens,
  support_tickets,
  support_replies,
  users,
  refresh_tokens,
  verification_codes,
  scheduler_runs,
} from "../../../platform/db/schema.js";
import type { Repository, UnitOfWork, Settings, PushToken, PushMessage } from "../domain/types.js";
type Connection = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];
export class MessagingRepository implements Repository {
  constructor(private readonly db: Connection) {}
  async listNotifications(userId: string, limit: number, offset: number) {
    const items = await this.db
      .select()
      .from(notifications)
      .where(eq(notifications.user_id, userId))
      .orderBy(desc(notifications.created_at), desc(notifications.id))
      .limit(limit)
      .offset(offset);
    const [total] = await this.db
      .select({ value: count() })
      .from(notifications)
      .where(eq(notifications.user_id, userId));
    const [unread] = await this.db
      .select({ value: count() })
      .from(notifications)
      .where(and(eq(notifications.user_id, userId), eq(notifications.is_read, false)));
    return { items, total: total!.value, unread: unread!.value };
  }
  async markRead(userId: string, ids: string[] | null) {
    if (ids?.length === 0) return;
    await this.db
      .update(notifications)
      .set({ is_read: true })
      .where(
        and(
          eq(notifications.user_id, userId),
          eq(notifications.is_read, false),
          ids === null ? undefined : inArray(notifications.id, ids),
        ),
      );
  }
  async getSettings(userId: string): Promise<Settings | null> {
    const row = (
      await this.db
        .select()
        .from(notification_settings)
        .where(eq(notification_settings.user_id, userId))
        .limit(1)
    )[0];
    if (!row) return null;
    return {
      push_enabled: row.push_enabled,
      workout_reminders: row.workout_reminders,
      measurement_reminders: row.measurement_reminders,
      progress_updates: row.progress_updates,
      weekly_reports: row.weekly_reports,
      motivational: row.motivational,
      new_features: row.new_features,
    };
  }
  async saveSettings(userId: string, settings: Settings) {
    await this.db
      .insert(notification_settings)
      .values({ user_id: userId, ...settings })
      .onConflictDoUpdate({
        target: notification_settings.user_id,
        set: settings,
      });
  }
  async registerToken(
    userId: string,
    token: string,
    platform: string,
    keys: { p256dh: string; auth: string } | null,
  ) {
    const values = {
      user_id: userId,
      token,
      platform,
      p256dh: keys?.p256dh ?? null,
      auth: keys?.auth ?? null,
    };
    await this.db
      .insert(push_tokens)
      .values(values)
      .onConflictDoUpdate({ target: push_tokens.token, set: values });
  }
  tokens(userId: string) {
    return this.db.select().from(push_tokens).where(eq(push_tokens.user_id, userId));
  }
  async evictToken(token: PushToken) {
    await this.db
      .delete(push_tokens)
      .where(
        and(
          eq(push_tokens.id, token.id),
          eq(push_tokens.user_id, token.user_id),
          eq(push_tokens.platform, token.platform),
          token.p256dh === null ? isNull(push_tokens.p256dh) : eq(push_tokens.p256dh, token.p256dh),
          token.auth === null ? isNull(push_tokens.auth) : eq(push_tokens.auth, token.auth),
        ),
      );
  }
  async createTicket(userId: string, subject: string, message: string) {
    return (
      await this.db
        .insert(support_tickets)
        .values({ user_id: userId, subject, message, status: "open" })
        .returning()
    )[0]!;
  }
  listTickets(userId: string) {
    return this.db
      .select()
      .from(support_tickets)
      .where(eq(support_tickets.user_id, userId))
      .orderBy(desc(support_tickets.created_at), desc(support_tickets.id));
  }
  async getTicket(id: string) {
    return (
      (
        await this.db
          .select()
          .from(support_tickets)
          .where(eq(support_tickets.id, id))
          .limit(1)
          .for("update")
      )[0] ?? null
    );
  }
  listReplies(ticketId: string) {
    return this.db
      .select()
      .from(support_replies)
      .where(eq(support_replies.ticket_id, ticketId))
      .orderBy(asc(support_replies.created_at), asc(support_replies.id));
  }
  async replyToTicket(ticketId: string, body: string) {
    await this.db.insert(support_replies).values({ ticket_id: ticketId, author: "user", body });
    await this.db
      .update(support_tickets)
      .set({ status: "open" })
      .where(eq(support_tickets.id, ticketId));
  }
  async activeUnverified() {
    const rows = await this.db
      .select({
        id: users.id,
        verification_deadline_at: users.verification_deadline_at,
      })
      .from(users)
      .where(
        and(
          eq(users.is_active, true),
          eq(users.email_verified, false),
          isNotNull(users.verification_deadline_at),
        ),
      );
    return rows.filter(
      (row): row is { id: string; verification_deadline_at: Date } =>
        row.verification_deadline_at !== null,
    );
  }
  async createNotification(message: PushMessage) {
    await this.db.insert(notifications).values({
      user_id: message.userId,
      type: message.type,
      title: message.title,
      body: message.body,
      payload: message.data ?? null,
      is_read: false,
    });
  }
  async housekeeping(now: Date) {
    const tokens = await this.db
      .delete(refresh_tokens)
      .where(or(lte(refresh_tokens.expires_at, now), isNotNull(refresh_tokens.revoked_at)))
      .returning({ id: refresh_tokens.id });
    const codes = await this.db
      .delete(verification_codes)
      .where(or(lte(verification_codes.expires_at, now), isNotNull(verification_codes.used_at)))
      .returning({ id: verification_codes.id });
    return { tokens: tokens.length, codes: codes.length };
  }
  /**
   * Claims a task for the day, or returns null if another runner already has it.
   *
   * The mutual exclusion is the unique index on (task_name, run_date): the insert either wins
   * and returns an id, or conflicts and returns nothing. This holds across processes and for
   * the whole run, because the claim row outlives the transaction that wrote it.
   *
   * There used to be a `pg_try_advisory_xact_lock` in front of this. It did nothing: a
   * transaction-scoped lock is released when its own transaction ends, and that happens here,
   * before the task the claim is protecting has started. It suggested a guarantee the code
   * did not have, which is worse than no lock at all.
   */
  async claimTask(name: string, runDate: string, now: Date) {
    const [row] = await this.db
      .insert(scheduler_runs)
      .values({
        task_name: name,
        run_date: runDate,
        status: "running",
        started_at: now,
      })
      .onConflictDoNothing({
        target: [scheduler_runs.task_name, scheduler_runs.run_date],
      })
      .returning({ id: scheduler_runs.id });
    return row?.id ?? null;
  }
  async finishTask(id: string, status: "success" | "failed", detail: string | null, now: Date) {
    await this.db
      .update(scheduler_runs)
      .set({ status, detail, finished_at: now })
      .where(eq(scheduler_runs.id, id));
  }
  async reapStaleTasks(cutoff: Date, now: Date) {
    return (
      await this.db
        .update(scheduler_runs)
        .set({
          status: "failed",
          detail: "stale: no completion within threshold",
          finished_at: now,
        })
        .where(and(eq(scheduler_runs.status, "running"), lt(scheduler_runs.started_at, cutoff)))
        .returning({ id: scheduler_runs.id })
    ).length;
  }
}
export class MessagingUnitOfWork implements UnitOfWork {
  constructor(private readonly db: Database) {}
  run<T>(work: (repo: Repository) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(new MessagingRepository(tx)));
  }
}
