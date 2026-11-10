import { AppError } from "../../../domain/error.js";
import { defaultProfile, defaultSettings, PersistedAttemptError } from "../domain/rules.js";
import type {
  AuthConfig,
  AuthRepository,
  Code,
  Profile,
  Purpose,
  Security,
  Settings,
  UnitOfWork,
  User,
} from "../domain/ports.js";

const HOUR_SECONDS = 3600;
const DAY_SECONDS = 86400;
const HOUR_MS = HOUR_SECONDS * 1000;
const DAY_MS = DAY_SECONDS * 1000;

/**
 * Fallbacks for the code-sending limits and lifetimes. `loadConfig` always supplies these, so
 * they only apply to a module built directly — tests, mostly — and are kept in step with
 * config.ts.
 */
const DEFAULT_MIN_INTERVAL_SECONDS = 60;
const DEFAULT_MAX_PER_CONTACT_HOUR = 5;
const DEFAULT_MAX_PER_CONTACT_DAY = 10;
const DEFAULT_MAX_PER_IP_HOUR = 20;
const DEFAULT_VERIFICATION_CODE_TTL_SECONDS = 600;
const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 900;
const DEFAULT_REFRESH_TOKEN_TTL_SECONDS = 30 * DAY_SECONDS;

/** How many wrong guesses a verification code tolerates before it has to be reissued. */
const MAX_CODE_ATTEMPTS = 5;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export type ContactType = "email" | "phone";

export type SendInput = {
  captcha_token?: string | null;
};

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

/** One rate-limit window: the attempts inside it, how many are allowed, and how wide it is. */
interface SendWindow {
  attempts: { created_at: Date }[];
  limit: number;
  windowSeconds: number;
}

/**
 * The machinery every auth use case is built from: transactions, the clock, verification
 * codes, rate limiting and token issuing.
 *
 * It exists as one object so these stay single-instance. `run` in particular carries a
 * security invariant that a second, subtly different copy would break — see its comment and
 * that of PersistedAttemptError.
 */
export class AuthCore {
  constructor(
    private readonly uow: UnitOfWork,
    readonly security: Security,
    readonly config: AuthConfig,
  ) {
    if (config.rotateDevVerificationCode && config.devVerificationCode !== "000000")
      throw new Error("Rotating verification codes require the e2e base code 000000");
  }

  now(): Date {
    return this.config.now?.() ?? new Date();
  }

  /** A moment `value` seconds from now. */
  seconds(value: number): Date {
    return new Date(this.now().getTime() + value * 1000);
  }

  /** How long a freshly issued verification code stays valid. */
  ttl(): number {
    return this.config.verificationCodeTtlSeconds ?? DEFAULT_VERIFICATION_CODE_TTL_SECONDS;
  }

  isUuid(value: string): boolean {
    return UUID_PATTERN.test(value);
  }

  /**
   * Runs `work` in a transaction, with one exception to the usual rollback-on-throw rule.
   *
   * A PersistedAttemptError is converted into a value so the transaction commits, and is
   * rethrown once it has. That is what keeps a failed verification attempt counted — see the
   * type's own comment for why the counter must survive the failure. Every other error
   * propagates and rolls the transaction back as normal.
   */
  async run<T>(work: (repo: AuthRepository) => Promise<T>): Promise<T> {
    const outcome = await this.uow.run(async (repo) => {
      try {
        return { value: await work(repo) };
      } catch (error) {
        if (error instanceof PersistedAttemptError) return { error };
        throw error;
      }
    });
    if ("error" in outcome) throw outcome.error;
    return outcome.value;
  }

  /**
   * The active user behind an id, locked for update.
   *
   * Reports the same "Invalid credentials" as a wrong password for a missing or deactivated
   * account, so the response cannot be used to learn which accounts exist.
   */
  async current(repo: AuthRepository, id: string): Promise<User> {
    const user = await repo.getUser(id, true);
    if (!user?.is_active)
      throw new AppError("unauthorized", "Invalid credentials", { reason: "invalid_credentials" });
    return user;
  }

  /**
   * Rate limits code sending, then records the attempt.
   *
   * Three windows apply at once — per contact per hour, per contact per day, and per IP per
   * hour — on top of a minimum interval between two codes for the same purpose. Each throws
   * `rate_limited` with the seconds until it frees up, which the HTTP layer turns into a
   * Retry-After header.
   */
  async guard(
    repo: AuthRepository,
    contact: string,
    purpose: Purpose,
    ip: string | null,
    data: SendInput,
  ): Promise<void> {
    await this.verifyCaptcha(data, ip);

    const now = this.now();
    const dayAgo = new Date(now.getTime() - DAY_MS);
    const hourAgo = new Date(now.getTime() - HOUR_MS);

    const attempts = await repo.sendAttempts(contact, ip, dayAgo);
    const forContact = attempts.filter((attempt) => attempt.contact === contact);

    const previous = forContact
      .filter((attempt) => attempt.purpose === purpose)
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())[0];
    const minInterval = this.config.codeSendMinIntervalSeconds ?? DEFAULT_MIN_INTERVAL_SECONDS;

    if (previous) {
      const elapsed = (now.getTime() - previous.created_at.getTime()) / 1000;
      if (elapsed < minInterval)
        throw new AppError("rate_limited", "Code was sent recently, wait before retrying", {
          reason: "code_send_cooldown",
          retry_after_seconds: Math.floor(minInterval - elapsed) + 1,
        });
    }

    const windows: SendWindow[] = [
      {
        attempts: forContact.filter((attempt) => attempt.created_at >= hourAgo),
        limit: this.config.codeSendMaxPerContactHour ?? DEFAULT_MAX_PER_CONTACT_HOUR,
        windowSeconds: HOUR_SECONDS,
      },
      {
        attempts: forContact,
        limit: this.config.codeSendMaxPerContactDay ?? DEFAULT_MAX_PER_CONTACT_DAY,
        windowSeconds: DAY_SECONDS,
      },
      {
        // Without a known IP there is nothing to bucket by, so this window cannot apply.
        attempts:
          ip === null
            ? []
            : attempts.filter((attempt) => attempt.ip === ip && attempt.created_at >= hourAgo),
        limit: this.config.codeSendMaxPerIpHour ?? DEFAULT_MAX_PER_IP_HOUR,
        windowSeconds: HOUR_SECONDS,
      },
    ];

    for (const { attempts: rows, limit, windowSeconds } of windows) {
      if (rows.length < limit) continue;

      // The window frees up when its oldest attempt falls out of it.
      const oldest = Math.min(...rows.map((attempt) => attempt.created_at.getTime()));
      const freesAt = oldest + windowSeconds * 1000;
      throw new AppError("rate_limited", "Too many codes requested, try again later", {
        reason: "code_send_limit",
        retry_after_seconds: Math.max(1, Math.floor((freesAt - now.getTime()) / 1000) + 1),
      });
    }

    await repo.addSendAttempt({ contact, purpose, ip, created_at: now });
  }

  async verifyCaptcha(data: SendInput, ip: string | null): Promise<void> {
    if (this.config.captcha && !(await this.config.captcha.verify(data.captcha_token ?? null, ip)))
      throw new AppError("validation_error", "Подтвердите, что вы не робот, и попробуйте ещё раз", {
        reason: "captcha_failed",
      });
  }

  /** Stores a fresh verification code and hands it to the notification sender. */
  async issue(
    repo: AuthRepository,
    contact: string,
    purpose: Purpose,
    userId: string,
  ): Promise<void> {
    let code = this.config.devVerificationCode ?? this.security.randomCode();
    if (this.config.rotateDevVerificationCode) {
      // `guard` has already recorded this send in the same transaction. Counting
      // by contact and purpose gives the first code 000000 and the first resend
      // 000001, even if the backend process restarts between the two requests.
      // The e2e database is reset before every run; no production config can
      // enable this path (loadConfig rejects it outright).
      const sends = await repo.sendAttempts(contact, null, new Date(0));
      const sequence = sends.filter((attempt) => attempt.purpose === purpose).length;
      if (sequence === 0) throw new Error("Verification code issued without a send attempt");
      code = String((sequence - 1) % 1_000_000).padStart(6, "0");
    }
    await repo.addCode({
      id: this.security.id(),
      contact,
      purpose,
      user_id: userId,
      code_hash: this.security.hashToken(code),
      expires_at: this.seconds(this.ttl()),
      attempts: 0,
      used_at: null,
      created_at: this.now(),
    });
    await this.config.sender.sendVerificationCode(contact, code, purpose);
  }

  /**
   * Consumes a verification code, or fails.
   *
   * A wrong code increments the attempt counter and throws PersistedAttemptError so the
   * increment survives — without that the five-attempt ceiling would never be reached.
   */
  async check(
    repo: AuthRepository,
    purpose: Purpose,
    code: string,
    contact?: string,
    userId?: string,
  ): Promise<Code> {
    const record = await repo.activeCode(purpose, this.now(), contact, userId);
    if (!record)
      throw new AppError("not_found", "Verification code not found or expired", {
        reason: "verification_code_expired",
      });
    if (record.attempts >= MAX_CODE_ATTEMPTS)
      throw new AppError("validation_error", "Too many attempts, request a new code", {
        reason: "verification_attempts_exceeded",
      });

    if (this.security.hashToken(code) !== record.code_hash) {
      await repo.incrementCodeAttempts(record.id);
      throw new PersistedAttemptError("validation_error", "Invalid verification code", {
        reason: "invalid_verification_code",
      });
    }

    await repo.markCodeUsed(record.id, this.now());
    return record;
  }

  /** Issues an access/refresh pair, storing only the hash of the refresh token. */
  async pair(repo: AuthRepository, user: User): Promise<TokenPair> {
    const refresh_token = this.security.randomToken();
    await repo.addRefresh({
      id: this.security.id(),
      user_id: user.id,
      token_hash: this.security.hashToken(refresh_token),
      expires_at: this.seconds(
        this.config.refreshTokenTtlSeconds ?? DEFAULT_REFRESH_TOKEN_TTL_SECONDS,
      ),
      revoked_at: null,
    });

    return {
      access_token: await this.security.sign(
        "access",
        { sub: user.id, role: user.role },
        this.config.accessTokenTtlSeconds ?? DEFAULT_ACCESS_TOKEN_TTL_SECONDS,
      ),
      refresh_token,
      token_type: "bearer",
    };
  }

  /** The shape every endpoint that logs someone in returns. */
  async response(repo: AuthRepository, user: User) {
    return { user, tokens: await this.pair(repo, user) };
  }

  /** Reads the settings, creating the default row when the user has none yet. */
  async ensureSettings(repo: AuthRepository, id: string): Promise<Settings> {
    const settings = (await repo.getSettings(id)) ?? defaultSettings();
    await repo.saveSettings(id, settings);
    return settings;
  }

  /** Reads the profile, creating the default row when the user has none yet. */
  async ensureProfile(repo: AuthRepository, id: string): Promise<Profile> {
    const profile = (await repo.getProfile(id)) ?? defaultProfile();
    await repo.saveProfile(id, profile);
    return profile;
  }

  /**
   * Tells commerce a referred user qualified. Reported and swallowed on failure: a referral
   * bonus is not worth failing the registration that triggered it.
   */
  async qualify(userId: string): Promise<void> {
    try {
      await this.config.qualifyReferral?.(userId);
    } catch (error) {
      this.config.onIntegrationError?.(error);
    }
  }

  /** Rejects a contact already claimed by a different account. */
  async available(repo: AuthRepository, contact: string | null, id: string): Promise<void> {
    if (!contact) return;
    const existing = await repo.getByContact(contact);
    if (existing && existing.id !== id)
      // One `conflict` covered both contacts, so the client could not tell the
      // user WHICH one was taken. The reason splits them; "@" is the same
      // discriminator normalizeContact already uses.
      throw new AppError("conflict", "User with this phone or email already exists", {
        reason: contact.includes("@") ? "email_taken" : "phone_taken",
      });
  }

  /** The user's email or phone, refusing when the account has none. */
  contactOf(user: User, type: ContactType): string {
    const contact = user[type];
    if (!contact) throw new AppError("validation_error", `The account has no ${type}`);
    return contact;
  }

  isVerified(user: User, type: ContactType): boolean {
    return type === "email" ? user.email_verified : user.phone_verified;
  }

  /**
   * Marks a contact verified on the in-memory user; the caller persists it.
   *
   * Verifying an email also clears the deletion deadline — that countdown exists precisely to
   * force this confirmation.
   */
  markVerified(user: User, type: ContactType): void {
    if (type === "email") {
      user.email_verified = true;
      user.verification_deadline_at = null;
    } else user.phone_verified = true;
  }
}
