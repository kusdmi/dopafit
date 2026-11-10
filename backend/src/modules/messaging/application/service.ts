import { AppError } from "../../../domain/error.js";
import { pushTarget } from "../domain/push-target.js";
import {
  defaultSettings,
  deliveryEnabled,
  type Config,
  type PushMessage,
  type Settings,
  type Ticket,
  type UnitOfWork,
  type Repository,
  type PushProvider,
} from "../domain/types.js";

export class MessagingApplication {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly provider: PushProvider,
    private readonly config: Config,
  ) {}
  private now(): Date {
    return this.config.now?.() ?? new Date();
  }
  listNotifications(userId: string, limit: number, offset: number) {
    return this.uow.run((repo) => repo.listNotifications(userId, limit, offset));
  }
  markRead(userId: string, ids: string[] | null) {
    return this.uow.run((repo) => repo.markRead(userId, ids));
  }
  getSettings(userId: string) {
    return this.uow.run(async (repo) => {
      const settings = (await repo.getSettings(userId)) ?? defaultSettings();
      await repo.saveSettings(userId, settings);
      return settings;
    });
  }
  updateSettings(userId: string, patch: Partial<Record<keyof Settings, boolean | null>>) {
    return this.uow.run(async (repo) => {
      const settings = (await repo.getSettings(userId)) ?? defaultSettings();
      for (const [key, value] of Object.entries(patch)) {
        if (value === null) throw new AppError("validation_error", `${key} cannot be null`);
        if (value !== undefined) settings[key as keyof Settings] = value;
      }
      await repo.saveSettings(userId, settings);
      return settings;
    });
  }
  registerToken(
    userId: string,
    token: string,
    platform: string,
    keys: { p256dh: string; auth: string } | null,
  ) {
    return this.uow.run((repo) => repo.registerToken(userId, token, platform, keys));
  }
  /**
   * Sends one notification to every device the user has registered.
   *
   * The screen the tap opens is added here rather than by each producer: the rule is one per
   * notification type (domain/push-target.ts), and stamping it in the single place every push
   * passes through is what keeps the producers from each inventing their own answer. A type
   * with no screen to answer it gets no `url`, and the service worker opens the app at its
   * root — see frontend/src/sw.ts.
   */
  async deliver(message: PushMessage): Promise<void> {
    const tokens = await this.uow.run(async (repo) => {
      const settings = (await repo.getSettings(message.userId)) ?? defaultSettings();
      return deliveryEnabled(settings, message.type) ? repo.tokens(message.userId) : [];
    });
    const url = pushTarget(message.type, message.data);
    // `url` last: the route is this layer's to decide, and a producer must not be able to
    // send the device somewhere else by putting its own `url` in the payload.
    const data = url ? { ...message.data, url } : (message.data ?? null);
    for (const token of tokens) {
      try {
        const valid = await this.provider.send({
          token: token.token,
          platform: token.platform,
          keys: token.p256dh && token.auth ? { p256dh: token.p256dh, auth: token.auth } : null,
          title: message.title,
          body: message.body,
          data,
        });
        if (!valid) await this.uow.run((repo) => repo.evictToken(token));
      } catch (error) {
        this.config.onIntegrationError?.(error);
      }
    }
  }
  createTicket(userId: string, subject: string, message: string) {
    return this.uow.run((repo) => repo.createTicket(userId, subject, message));
  }
  listTickets(userId: string) {
    return this.uow.run((repo) => repo.listTickets(userId));
  }
  private async ownedTicket(repo: Repository, userId: string, ticketId: string): Promise<Ticket> {
    const ticket = await repo.getTicket(ticketId);
    if (!ticket) throw new AppError("not_found", "Ticket not found");
    if (ticket.user_id !== userId) throw new AppError("forbidden", "Not your ticket");
    return ticket;
  }
  getTicket(userId: string, ticketId: string) {
    return this.uow.run(async (repo) => {
      const ticket = await this.ownedTicket(repo, userId, ticketId);
      return { ...ticket, replies: await repo.listReplies(ticketId) };
    });
  }
  reply(userId: string, ticketId: string, body: string) {
    return this.uow.run(async (repo) => {
      await this.ownedTicket(repo, userId, ticketId);
      await repo.replyToTicket(ticketId, body);
    });
  }
  async verificationReminders(): Promise<string> {
    const now = this.now();
    const messages = await this.uow.run(async (repo) => {
      const users = await repo.activeUnverified();
      const messages: PushMessage[] = [];
      for (const user of users) {
        const days = Math.round(
          (Date.parse(user.verification_deadline_at.toISOString().slice(0, 10)) -
            Date.parse(now.toISOString().slice(0, 10))) /
            86400000,
        );
        if (![7, 3, 1].includes(days)) continue;
        const message: PushMessage = {
          userId: user.id,
          type: "account",
          title: "Подтвердите email",
          body: `Аккаунт будет удалён вместе с данными через ${days} дн. Подтвердите email в настройках.`,
        };
        await repo.createNotification(message);
        messages.push(message);
      }
      return messages;
    });
    for (const message of messages) {
      try {
        await this.deliver(message);
      } catch (error) {
        this.config.onIntegrationError?.(error);
      }
    }
    return `reminded=${messages.length}`;
  }
  async deactivateOverdue(): Promise<string> {
    const candidates = await this.uow.run((repo) => repo.activeUnverified());
    let count = 0;
    for (const user of candidates) {
      if (user.verification_deadline_at > this.now()) continue;
      if (!this.config.anonymizeOverdue)
        throw new Error("Anonymization adapter is required for overdue accounts");
      try {
        await this.deliver({
          userId: user.id,
          type: "account",
          title: "Аккаунт удалён",
          body: "Email не был подтверждён в течение 90 дней. Аккаунт и персональные данные удалены.",
        });
      } catch (error) {
        this.config.onIntegrationError?.(error);
      }
      if (await this.config.anonymizeOverdue(user.id)) count++;
    }
    return `anonymized=${count}`;
  }
  async housekeeping(): Promise<string> {
    const result = await this.uow.run((repo) => repo.housekeeping(this.now()));
    return `refresh_tokens=${result.tokens} verification_codes=${result.codes}`;
  }
  reapStaleRuns(): Promise<number> {
    const now = this.now();
    return this.uow.run((repo) =>
      repo.reapStaleTasks(
        new Date(now.getTime() - (this.config.staleRunHours ?? 1) * 3600000),
        now,
      ),
    );
  }
  async runDueTasks(
    options: { runDate?: string; only?: readonly string[] } = {},
  ): Promise<string[]> {
    await this.reapStaleRuns();
    const date = options.runDate ?? this.now().toISOString().slice(0, 10);
    const executed: string[] = [];
    const tasks: Record<string, () => Promise<string>> = {
      verification_reminders: () => this.verificationReminders(),
      deactivate_overdue: () => this.deactivateOverdue(),
      housekeeping: () => this.housekeeping(),
    };
    for (const [name, task] of Object.entries(tasks)) {
      if (options.only && !options.only.includes(name)) continue;
      const id = await this.uow.run((repo) => repo.claimTask(name, date, this.now()));
      if (!id) continue;
      try {
        const detail = await task();
        await this.uow.run((repo) =>
          repo.finishTask(id, "success", detail.slice(0, 500) || null, this.now()),
        );
      } catch (error) {
        this.config.onIntegrationError?.(error);
        await this.uow.run((repo) =>
          repo.finishTask(
            id,
            "failed",
            (error instanceof Error ? error.message : "failed").slice(0, 500) || "failed",
            this.now(),
          ),
        );
      }
      executed.push(name);
    }
    return executed;
  }
}
