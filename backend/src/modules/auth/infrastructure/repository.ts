import { and, desc, eq, gt, gte, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import type { Database } from "../../../platform/db/index.js";
import {
  code_send_attempts,
  managed_clients,
  measurement_photos,
  measurements,
  push_tokens,
  referrals,
  refresh_tokens,
  user_profiles,
  user_settings,
  users,
  verification_codes,
} from "../../../platform/db/schema.js";
import { AppError } from "../../../domain/error.js";
import { normalizeContact } from "../domain/rules.js";
import type {
  AuthRepository,
  Code,
  Profile,
  Purpose,
  RefreshToken,
  SendAttempt,
  Settings,
  UnitOfWork,
  User,
} from "../domain/ports.js";
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Connection = Database | Transaction;
export class DrizzleAuthRepository implements AuthRepository {
  constructor(private readonly db: Connection) {}
  async getUser(id: string, lock = false): Promise<User | null> {
    const query = this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return (await (lock ? query.for("update") : query))[0] ?? null;
  }
  async getByContact(value: string): Promise<User | null> {
    const contact = normalizeContact(value);
    return (
      (
        await this.db
          .select()
          .from(users)
          .where(or(eq(sql`lower(${users.email})`, contact), eq(users.phone, contact)))
          .limit(1)
      )[0] ?? null
    );
  }
  async insertUser(user: User): Promise<void> {
    await this.db.insert(users).values({
      ...user,
      deactivation_reason: user.deactivation_reason as "user_request" | "unverified_email" | null,
    });
  }
  async saveUser(user: User): Promise<void> {
    await this.db
      .update(users)
      .set({
        ...user,
        deactivation_reason: user.deactivation_reason as "user_request" | "unverified_email" | null,
      })
      .where(eq(users.id, user.id));
  }
  async getProfile(userId: string): Promise<Profile | null> {
    return (
      (
        await this.db
          .select({
            full_name: user_profiles.full_name,
            first_name: user_profiles.first_name,
            last_name: user_profiles.last_name,
            middle_name: user_profiles.middle_name,
            gender: user_profiles.gender,
            birth_date: user_profiles.birth_date,
            city: user_profiles.city,
            injuries: user_profiles.injuries,
            clients_per_month: user_profiles.clients_per_month,
          })
          .from(user_profiles)
          .where(eq(user_profiles.user_id, userId))
          .limit(1)
      )[0] ?? null
    );
  }
  async saveProfile(userId: string, profile: Profile): Promise<void> {
    await this.db
      .insert(user_profiles)
      .values({ user_id: userId, ...profile })
      .onConflictDoUpdate({ target: user_profiles.user_id, set: profile });
  }
  async getSettings(userId: string): Promise<Settings | null> {
    const row = (
      await this.db.select().from(user_settings).where(eq(user_settings.user_id, userId)).limit(1)
    )[0];
    if (!row) return null;
    return {
      theme: row.theme,
      notifications_enabled: row.notifications_enabled,
      analytics_config: row.analytics_config,
    };
  }
  async saveSettings(userId: string, settings: Settings): Promise<void> {
    await this.db
      .insert(user_settings)
      .values({ user_id: userId, ...settings })
      .onConflictDoUpdate({ target: user_settings.user_id, set: settings });
  }
  async saveOnboardingMeasurement(
    userId: string,
    date: string,
    height: number,
    weight: number,
  ): Promise<void> {
    await this.db
      .insert(measurements)
      .values({
        user_id: userId,
        date,
        height,
        weight,
        custom_values: [],
        created_by_user_id: userId,
      })
      .onConflictDoUpdate({
        target: [measurements.user_id, measurements.date],
        set: { height, weight },
      });
  }
  async addCode(code: Code): Promise<void> {
    await this.db.insert(verification_codes).values(code);
  }
  async getCode(id: string): Promise<Code | null> {
    return (
      (
        await this.db
          .select()
          .from(verification_codes)
          .where(eq(verification_codes.id, id))
          .limit(1)
          .for("update")
      )[0] ?? null
    );
  }
  async activeCode(
    purpose: Purpose,
    now: Date,
    contact?: string,
    userId?: string,
  ): Promise<Code | null> {
    return (
      (
        await this.db
          .select()
          .from(verification_codes)
          .where(
            and(
              eq(verification_codes.purpose, purpose),
              gt(verification_codes.expires_at, now),
              isNull(verification_codes.used_at),
              contact === undefined ? undefined : eq(verification_codes.contact, contact),
              userId === undefined ? undefined : eq(verification_codes.user_id, userId),
            ),
          )
          .orderBy(desc(verification_codes.created_at))
          .limit(1)
          .for("update")
      )[0] ?? null
    );
  }
  async markCodeUsed(id: string, now: Date): Promise<void> {
    await this.db
      .update(verification_codes)
      .set({ used_at: now })
      .where(eq(verification_codes.id, id));
  }
  async incrementCodeAttempts(id: string): Promise<void> {
    await this.db
      .update(verification_codes)
      .set({ attempts: sql`${verification_codes.attempts}+1` })
      .where(eq(verification_codes.id, id));
  }
  async deleteCode(id: string): Promise<void> {
    await this.db.delete(verification_codes).where(eq(verification_codes.id, id));
  }
  async sendAttempts(contact: string, ip: string | null, since: Date): Promise<SendAttempt[]> {
    // Transaction-level locks make concurrent ghost and real send requests share the same limits.
    const locks = [`contact:${contact}`, ...(ip === null ? [] : [`ip:${ip}`])].sort();
    for (const key of locks)
      await this.db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
    await this.db.delete(code_send_attempts).where(lt(code_send_attempts.created_at, since));
    return this.db
      .select()
      .from(code_send_attempts)
      .where(
        and(
          gte(code_send_attempts.created_at, since),
          or(
            eq(code_send_attempts.contact, contact),
            ip === null ? undefined : eq(code_send_attempts.ip, ip),
          ),
        ),
      );
  }
  async addSendAttempt(attempt: SendAttempt): Promise<void> {
    await this.db.insert(code_send_attempts).values(attempt);
  }
  async addRefresh(token: RefreshToken): Promise<void> {
    await this.db.insert(refresh_tokens).values(token);
  }
  async validRefresh(hash: string, now: Date): Promise<RefreshToken | null> {
    return (
      (
        await this.db
          .select()
          .from(refresh_tokens)
          .where(
            and(
              eq(refresh_tokens.token_hash, hash),
              isNull(refresh_tokens.revoked_at),
              gt(refresh_tokens.expires_at, now),
            ),
          )
          .limit(1)
          .for("update")
      )[0] ?? null
    );
  }
  async revokeRefresh(id: string, now: Date): Promise<void> {
    await this.db.update(refresh_tokens).set({ revoked_at: now }).where(eq(refresh_tokens.id, id));
  }
  async revokeSessions(userId: string, now: Date, keepHash?: string): Promise<void> {
    await this.db
      .update(refresh_tokens)
      .set({ revoked_at: now })
      .where(
        and(
          eq(refresh_tokens.user_id, userId),
          isNull(refresh_tokens.revoked_at),
          keepHash === undefined ? undefined : ne(refresh_tokens.token_hash, keepHash),
        ),
      );
  }
  async linkReferral(userId: string, inviteCode: string): Promise<void> {
    const referrer = (
      await this.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.referral_code, inviteCode))
        .limit(1)
    )[0];
    if (referrer && referrer.id !== userId)
      await this.db
        .insert(referrals)
        .values({ referrer_id: referrer.id, referred_user_id: userId })
        .onConflictDoNothing({ target: referrals.referred_user_id });
  }
  async anonymize(
    user: User,
    now: Date,
    reason: "user_request" | "unverified_email",
  ): Promise<string[]> {
    const photos = await this.db
      .select({ id: measurement_photos.id, key: measurement_photos.object_key })
      .from(measurement_photos)
      .innerJoin(measurements, eq(measurement_photos.measurement_id, measurements.id))
      .where(eq(measurements.user_id, user.id));
    if (photos.length)
      await this.db.delete(measurement_photos).where(
        inArray(
          measurement_photos.id,
          photos.map((x) => x.id),
        ),
      );
    await this.db
      .update(user_profiles)
      .set({
        full_name: "Удалённый пользователь",
        first_name: "",
        last_name: null,
        middle_name: null,
        birth_date: null,
        city: null,
        injuries: null,
      })
      .where(eq(user_profiles.user_id, user.id));
    const contacts = [user.email, user.phone].filter(
      (contact): contact is string => contact !== null,
    );
    await this.db
      .update(users)
      .set({
        email: null,
        phone: null,
        password_hash: null,
        email_verified: false,
        phone_verified: false,
        verification_deadline_at: null,
        is_active: false,
        deactivated_at: now,
        anonymized_at: now,
        deactivation_reason: reason,
      })
      .where(eq(users.id, user.id));
    await this.db.delete(refresh_tokens).where(eq(refresh_tokens.user_id, user.id));
    await this.db.delete(push_tokens).where(eq(push_tokens.user_id, user.id));
    await this.db
      .delete(verification_codes)
      .where(
        or(
          eq(verification_codes.user_id, user.id),
          contacts.length ? inArray(verification_codes.contact, contacts) : undefined,
        ),
      );
    await this.db
      .delete(code_send_attempts)
      .where(contacts.length ? inArray(code_send_attempts.contact, contacts) : sql`false`);
    await this.db.delete(managed_clients).where(eq(managed_clients.owner_id, user.id));
    return photos.map((photo) => photo.key);
  }
}
export class DrizzleAuthUnitOfWork implements UnitOfWork {
  constructor(private readonly db: Database) {}
  async run<T>(work: (repository: AuthRepository) => Promise<T>): Promise<T> {
    try {
      return await this.db.transaction((tx) => work(new DrizzleAuthRepository(tx)));
    } catch (error) {
      const cause = error instanceof Error && error.cause ? error.cause : error;
      if (
        typeof cause === "object" &&
        cause !== null &&
        "code" in cause &&
        cause.code === "23505" &&
        "constraint" in cause &&
        ["uq_users_email_lower", "uq_users_phone", "users_phone_key"].includes(
          String(cause.constraint),
        )
      )
        // The violated constraint already names the colliding column, so the
        // reason can say which contact is taken instead of leaving the client
        // to guess from one shared `conflict`.
        throw new AppError("conflict", "User with this phone or email already exists", {
          reason:
            String(cause.constraint) === "uq_users_email_lower" ? "email_taken" : "phone_taken",
        });
      throw error;
    }
  }
}
