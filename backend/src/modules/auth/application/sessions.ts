import { AppError } from "../../../domain/error.js";
import type { Principal } from "../../../domain/principal.js";
import { normalizeContact } from "../domain/rules.js";
import { AuthCore, type SendInput, type TokenPair } from "./core.js";

/**
 * Signing in and holding a session: password login, code login, two-factor, and the refresh
 * token rotation behind both.
 *
 * The responses here are deliberately uniform — a wrong password, an unknown contact and a
 * deactivated account all answer the same way, so none of them can be used to discover which
 * accounts exist.
 */
export class AuthSessions {
  constructor(private readonly core: AuthCore) {}

  async authenticate(token: string): Promise<Principal> {
    const payload = await this.core.security.decode(token, "access");
    if (!payload || typeof payload.sub !== "string" || !this.core.isUuid(payload.sub))
      throw new AppError("unauthorized", "Invalid credentials", { reason: "invalid_credentials" });
    return this.core.run(async (repo) => {
      const user = await this.core.current(repo, payload.sub as string);
      return { id: user.id, role: user.role };
    });
  }
  async login(
    data: { contact: string; password: string; challenge_token?: string | null } & SendInput,
    ip: string | null = null,
  ) {
    await this.core.verifyCaptcha(data, ip);
    return this.core.run(async (repo) => {
      const user = await repo.getByContact(normalizeContact(data.contact));
      const valid = await this.core.security.verifyPassword(
        data.password,
        user?.is_active ? user.password_hash : null,
      );
      if (!user?.is_active || !valid || user.login_method === "code")
        throw new AppError("unauthorized", "Invalid credentials", {
          reason: "invalid_credentials",
        });
      if (user.login_method === "two_factor") {
        const payload = data.challenge_token
          ? await this.core.security.decode(data.challenge_token, "two_factor")
          : null;
        if (payload?.sub !== user.id || payload?.purpose !== "2fa_code_passed")
          throw new AppError("unauthorized", "Invalid credentials", {
            reason: "invalid_credentials",
          });
      }
      return this.core.response(repo, user);
    });
  }
  async loginRequestCode(
    data: {
      contact: string;
    } & SendInput,
    ip: string | null,
  ) {
    return this.core.run(async (repo) => {
      const contact = normalizeContact(data.contact);
      await this.core.guard(repo, contact, "login", ip, data);
      const user = await repo.getByContact(contact);
      if (user?.is_active && !(user.password_hash && user.login_method === "password"))
        await this.core.issue(repo, contact, "login", user.id);
      return { expires_in_seconds: this.core.ttl() };
    });
  }
  async loginVerifyCode(data: { contact: string; code: string }) {
    return this.core.run(async (repo) => {
      const contact = normalizeContact(data.contact);
      const user = await repo.getByContact(contact);
      if (!user?.is_active || (user.password_hash && user.login_method === "password"))
        throw new AppError("not_found", "Verification code not found or expired", {
          reason: "verification_code_expired",
        });
      await this.core.check(repo, "login", data.code, contact);
      if (contact === user.email) {
        user.email_verified = true;
        user.verification_deadline_at = null;
      } else if (contact === user.phone) user.phone_verified = true;
      await repo.saveUser(user);
      if (user.login_method === "two_factor")
        return {
          two_factor_required: true,
          challenge_token: await this.core.security.sign(
            "two_factor",
            { sub: user.id, purpose: "2fa_code_passed" },
            this.core.config.twoFactorTokenTtlSeconds ?? 300,
          ),
          auth: null,
        };
      await this.core.ensureSettings(repo, user.id);
      return {
        two_factor_required: false,
        challenge_token: null,
        auth: await this.core.response(repo, user),
      };
    });
  }
  async refresh(token: string): Promise<TokenPair> {
    return this.core.run(async (repo) => {
      const record = await repo.validRefresh(this.core.security.hashToken(token), this.core.now());
      if (!record)
        throw new AppError("unauthorized", "Invalid refresh token", {
          reason: "invalid_refresh_token",
        });
      const user = await repo.getUser(record.user_id);
      if (!user?.is_active)
        throw new AppError("unauthorized", "Invalid refresh token", {
          reason: "invalid_refresh_token",
        });
      await repo.revokeRefresh(record.id, this.core.now());
      return this.core.pair(repo, user);
    });
  }
  async logout(token: string): Promise<void> {
    await this.core.run(async (repo) => {
      const record = await repo.validRefresh(this.core.security.hashToken(token), this.core.now());
      if (record) await repo.revokeRefresh(record.id, this.core.now());
    });
  }
}
