import { AppError } from "../../../domain/error.js";
import type { Principal } from "../../../domain/principal.js";
import {
  defaultProfile,
  splitName,
  normalizeContact,
  validateContact,
  validatePassword,
} from "../domain/rules.js";
import { AuthCore, type SendInput } from "./core.js";

/**
 * Creating an account: the initial request, confirming the email, and setting the first
 * password.
 *
 * A registration that was started but never confirmed can be repeated — the unverified user
 * row is reused rather than rejected as a duplicate.
 */
export class AuthRegistration {
  constructor(private readonly core: AuthCore) {}

  async register(
    data: {
      email: string;
      full_name: string;
      role: Principal["role"];
      personal_data_consent: boolean;
      invite_code?: string | null;
    } & SendInput,
    ip: string | null,
  ) {
    if (!data.personal_data_consent)
      throw new AppError("validation_error", "Personal data processing consent is required", {
        reason: "personal_data_consent_required",
      });
    const email = normalizeContact(data.email);
    validateContact("email", email);
    return this.core.run(async (repo) => {
      await this.core.guard(repo, email, "register", ip, data);
      let user = await repo.getByContact(email);
      if (user && (user.email_verified || user.password_hash))
        // `conflict` alone cannot say WHICH contact collided, so the machine-readable
        // reason carries that — the client localizes off it (see
        // frontend/src/shared/api/error-reasons.ts). The message stays English and
        // developer-facing: it is a log line, not user copy.
        throw new AppError("conflict", "User with this email already exists", {
          reason: "email_taken",
        });
      if (!user) {
        user = {
          id: this.core.security.id(),
          email,
          phone: null,
          password_hash: null,
          role: data.role,
          referral_code: this.core.security.referralCode(),
          email_verified: false,
          phone_verified: false,
          login_method: "code",
          personal_data_consent_at: this.core.now(),
          verification_deadline_at: this.core.seconds(
            (this.core.config.verificationDeadlineDays ?? 90) * 86400,
          ),
          is_active: true,
          deactivated_at: null,
          deactivation_reason: null,
          anonymized_at: null,
          created_at: this.core.now(),
        };
        await repo.insertUser(user);
      } else {
        user.role = data.role;
        user.personal_data_consent_at = this.core.now();
        await repo.saveUser(user);
      }
      const profile = (await repo.getProfile(user.id)) ?? defaultProfile();
      profile.full_name = data.full_name;
      Object.assign(profile, splitName(data.full_name));
      await repo.saveProfile(user.id, profile);
      if (data.invite_code) await repo.linkReferral(user.id, data.invite_code);
      await this.core.issue(repo, email, "register", user.id);
      return {
        contact: email,
        expires_in_seconds: this.core.ttl(),
        registration_token: await this.core.security.sign(
          "registration",
          { sub: user.id },
          this.core.config.registrationTokenTtlSeconds ?? 1800,
        ),
      };
    });
  }
  async registerVerify(data: { email: string; code: string }) {
    const result = await this.core.run(async (repo) => {
      const email = normalizeContact(data.email);
      const user = await repo.getByContact(email);
      if (!user)
        throw new AppError("not_found", "Verification code not found or expired", {
          reason: "verification_code_expired",
        });
      await this.core.check(repo, "register", data.code, email);
      user.email_verified = true;
      user.verification_deadline_at = null;
      await repo.saveUser(user);
      await this.core.ensureSettings(repo, user.id);
      return this.core.response(repo, user);
    });
    await this.core.qualify(result.user.id);
    return result;
  }
  async setPassword(data: { registration_token: string; password: string }) {
    validatePassword(data.password);
    const payload = await this.core.security.decode(data.registration_token, "registration");
    if (!payload || typeof payload.sub !== "string" || !this.core.isUuid(payload.sub))
      throw new AppError("unauthorized", "Invalid or expired registration token", {
        reason: "invalid_registration_token",
      });
    const result = await this.core.run(async (repo) => {
      const user = await repo.getUser(payload.sub as string, true);
      if (!user?.is_active)
        throw new AppError("unauthorized", "Invalid or expired registration token", {
          reason: "invalid_registration_token",
        });
      if (user.email_verified || user.password_hash)
        throw new AppError("conflict", "Registration is already completed", {
          reason: "registration_completed",
        });
      user.password_hash = await this.core.security.hashPassword(data.password);
      user.login_method = "password";
      await repo.saveUser(user);
      await this.core.ensureSettings(repo, user.id);
      return this.core.response(repo, user);
    });
    await this.core.qualify(result.user.id);
    return result;
  }
}
