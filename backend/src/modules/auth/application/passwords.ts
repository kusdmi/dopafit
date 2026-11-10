import { AppError } from "../../../domain/error.js";
import { normalizeContact, validatePassword } from "../domain/rules.js";
import type { Purpose } from "../domain/ports.js";
import { AuthCore, type SendInput } from "./core.js";

/**
 * Passwords: resetting a forgotten one through a verification code, and changing a known one.
 *
 * Both paths revoke every existing session afterwards, so a password that may have leaked
 * cannot keep a stolen refresh token alive.
 */
export class AuthPasswords {
  constructor(private readonly core: AuthCore) {}

  async resendCode(
    data: {
      contact: string;
      purpose: Purpose;
    } & SendInput,
    ip: string | null,
  ): Promise<void> {
    if (!["register", "login", "password_reset"].includes(data.purpose))
      throw new AppError(
        "validation_error",
        "Use the corresponding settings endpoint for this code",
      );
    await this.core.run(async (repo) => {
      const contact = normalizeContact(data.contact);
      await this.core.guard(repo, contact, data.purpose, ip, data);
      const user = await repo.getByContact(contact);
      if (
        user?.is_active &&
        (data.purpose !== "register" || !user.email_verified) &&
        (data.purpose !== "login" || !(user.password_hash && user.login_method === "password"))
      )
        await this.core.issue(repo, contact, data.purpose, user.id);
    });
  }
  async requestPasswordReset(
    data: {
      contact: string;
    } & SendInput,
    ip: string | null,
  ): Promise<void> {
    await this.core.run(async (repo) => {
      const contact = normalizeContact(data.contact);
      await this.core.guard(repo, contact, "password_reset", ip, data);
      const user = await repo.getByContact(contact);
      if (user?.is_active) await this.core.issue(repo, contact, "password_reset", user.id);
    });
  }
  async verifyCode(data: { contact: string; purpose: Purpose; code: string }) {
    if (data.purpose !== "password_reset")
      throw new AppError("validation_error", "This purpose is confirmed via its own endpoint");
    return this.core.run(async (repo) => {
      const contact = normalizeContact(data.contact);
      const code = await this.core.check(repo, "password_reset", data.code, contact);
      return {
        verification_token: await this.core.security.sign(
          "verification",
          { contact, purpose: "password_reset", challenge_id: code.id },
          this.core.config.verificationTokenTtlSeconds ?? 900,
        ),
      };
    });
  }
  async confirmPasswordReset(data: {
    verification_token: string;
    new_password: string;
  }): Promise<void> {
    validatePassword(data.new_password);
    const payload = await this.core.security.decode(data.verification_token, "verification");
    if (
      !payload ||
      payload.purpose !== "password_reset" ||
      typeof payload.challenge_id !== "string" ||
      !this.core.isUuid(payload.challenge_id) ||
      typeof payload.contact !== "string"
    )
      throw new AppError("unauthorized", "Invalid or expired verification token", {
        reason: "invalid_verification_token",
      });
    await this.core.run(async (repo) => {
      const challenge = await repo.getCode(payload.challenge_id as string);
      if (
        !challenge ||
        challenge.contact !== payload.contact ||
        challenge.purpose !== "password_reset" ||
        !challenge.used_at ||
        challenge.expires_at <= this.core.now()
      )
        throw new AppError("unauthorized", "Invalid or expired verification token", {
          reason: "invalid_verification_token",
        });
      const user = await repo.getByContact(challenge.contact);
      if (!user) throw new AppError("not_found", "User not found");
      await repo.deleteCode(challenge.id);
      user.password_hash = await this.core.security.hashPassword(data.new_password);
      await repo.saveUser(user);
      await repo.revokeSessions(user.id, this.core.now());
    });
  }
  async changePassword(
    id: string,
    data: {
      current_password?: string | null;
      new_password: string;
    },
  ): Promise<void> {
    await this.core.run(async (repo) => {
      const user = await this.core.current(repo, id);
      if (
        user.password_hash &&
        (!data.current_password ||
          !(await this.core.security.verifyPassword(data.current_password, user.password_hash)))
      )
        throw new AppError("validation_error", "Current password is incorrect", {
          reason: "invalid_password",
        });
      validatePassword(data.new_password);
      user.password_hash = await this.core.security.hashPassword(data.new_password);
      await repo.saveUser(user);
      await repo.revokeSessions(id, this.core.now());
    });
  }
}
