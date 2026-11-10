import type { NotificationSender, Purpose } from "../modules/auth/index.js";
import nodemailer from "nodemailer";
import type { Config, SmtpConfigValues } from "../config.js";
import { AppError } from "../domain/error.js";
import { renderVerificationEmail } from "./email/verification.js";
import { EMAIL_BRAND_IMAGES } from "./email/brand.js";

export function smtpOptions(config: SmtpConfigValues) {
  return {
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    requireTLS: config.port === 587,
    auth: { user: config.user, pass: config.password },
    tls: { minVersion: "TLSv1.2" as const, rejectUnauthorized: true },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    logger: false,
    debug: false,
    disableFileAccess: true,
    disableUrlAccess: true,
  };
}

type MailTransport = Pick<ReturnType<typeof nodemailer.createTransport>, "sendMail">;

export class SmtpNotificationSender implements NotificationSender {
  constructor(
    private readonly config: SmtpConfigValues,
    private readonly ttlSeconds: number,
    private readonly transport: MailTransport = nodemailer.createTransport(smtpOptions(config)),
  ) {}

  async sendVerificationCode(contact: string, code: string, purpose: Purpose): Promise<void> {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact))
      throw new AppError("validation_error", "Отправка SMS пока недоступна");
    const email = renderVerificationEmail(purpose, code, this.ttlSeconds);
    try {
      const result = await this.transport.sendMail({
        from: { name: "DopaFit", address: this.config.user },
        to: [{ address: contact, name: "" }],
        ...email,
        attachments: EMAIL_BRAND_IMAGES,
      });
      if (!result.accepted?.length || result.rejected?.length) throw new Error("Rejected");
    } catch {
      // SMTP exceptions may include addresses and message content. Never propagate them.
      throw new AppError("validation_error", "Не удалось отправить письмо. Попробуйте позже", {
        reason: "email_delivery_failed",
      });
    }
  }
}

export function createNotificationSender(config: Config): NotificationSender {
  return config.smtp
    ? new SmtpNotificationSender(config.smtp, config.auth.verificationCodeTtlSeconds)
    : new LoggingNotificationSender(config.production);
}

/**
 * Delivery of verification codes, as the process provides it.
 *
 * `NotificationSender` is a port auth declares and calls but must not implement: what
 * actually delivers a message is an SMS gateway or a mail server, which is the process's
 * concern — the same reason the S3 adapter next door implements training's `FileStorage`.
 */

/**
 * Development/test transport: nothing is sent, the attempt is logged.
 *
 * The code is logged outside production because that log line is how a developer completes
 * a sign-up. In production it is withheld — it is a live credential — and the line records
 * only that a send was attempted and nothing arrived.
 *
 * This is a placeholder, and `loadConfig` refuses to start a production deployment that is
 * still relying on it. Connecting a real provider means adding one here and selecting it by
 * configuration, not editing this one.
 */
export class LoggingNotificationSender implements NotificationSender {
  constructor(private readonly production: boolean) {}

  async sendVerificationCode(contact: string, code: string, purpose: string): Promise<void> {
    console.info(
      JSON.stringify({
        provider: "logging",
        event: "verification-code",
        contact,
        purpose,
        ...(this.production ? { delivered: false } : { code }),
      }),
    );
  }
}
