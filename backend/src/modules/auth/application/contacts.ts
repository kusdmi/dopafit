import { AppError } from "../../../domain/error.js";
import { normalizeContact, validateContact } from "../domain/rules.js";
import type { LoginMethod, Purpose, User } from "../domain/ports.js";
import { AuthCore, type ContactType, type SendInput } from "./core.js";

/**
 * Verifying and changing the email and phone on an existing account, and switching which of
 * them signs the user in.
 *
 * Changing a contact is deliberately two-step — a code to the current address proves the
 * account, a code to the new one proves the new address — so losing access to a mailbox
 * cannot be turned into losing the account.
 */
export class AuthContacts {
  constructor(private readonly core: AuthCore) {}

  async contactVerifyRequest(
    id: string,
    data: {
      type: ContactType;
    } & SendInput,
    ip: string | null,
  ) {
    return this.core.run(async (repo) => {
      const user = await this.core.current(repo, id);
      const contact = this.core.contactOf(user, data.type);
      if (this.core.isVerified(user, data.type))
        throw new AppError("conflict", "Contact is already verified", {
          reason: "contact_already_verified",
        });
      const purpose = `verify_${data.type}` as Purpose;
      await this.core.guard(repo, contact, purpose, ip, data);
      await this.core.issue(repo, contact, purpose, id);
      return { contact, expires_in_seconds: this.core.ttl() };
    });
  }
  async contactVerifyConfirm(
    id: string,
    data: {
      type: ContactType;
      code: string;
    },
  ): Promise<User> {
    return this.core.run(async (repo) => {
      const user = await this.core.current(repo, id);
      await this.core.check(
        repo,
        `verify_${data.type}` as Purpose,
        data.code,
        this.core.contactOf(user, data.type),
        id,
      );
      this.core.markVerified(user, data.type);
      await repo.saveUser(user);
      return user;
    });
  }
  async contactChangeRequest(
    id: string,
    data: {
      type: ContactType;
      new_contact: string;
    } & SendInput,
    ip: string | null,
  ) {
    const contact = normalizeContact(data.new_contact);
    validateContact(data.type, contact);
    return this.core.run(async (repo) => {
      const user = await this.core.current(repo, id);
      if (!this.core.isVerified(user, data.type))
        throw new AppError("conflict", "Unverified contact is edited via PATCH /users/me");
      await this.core.available(repo, contact, id);
      const purpose = `change_${data.type}` as Purpose;
      await this.core.guard(repo, contact, purpose, ip, data);
      await this.core.issue(repo, contact, purpose, id);
      return { contact, expires_in_seconds: this.core.ttl() };
    });
  }
  async contactChangeConfirm(
    id: string,
    data: {
      type: ContactType;
      code: string;
      refresh_token?: string | null;
    },
  ): Promise<User> {
    return this.core.run(async (repo) => {
      const user = await this.core.current(repo, id);
      const record = await this.core.check(
        repo,
        `change_${data.type}` as Purpose,
        data.code,
        undefined,
        id,
      );
      await this.core.available(repo, record.contact, id);
      user[data.type] = record.contact;
      this.core.markVerified(user, data.type);
      await repo.saveUser(user);
      if (data.type === "email")
        await repo.revokeSessions(
          id,
          this.core.now(),
          data.refresh_token ? this.core.security.hashToken(data.refresh_token) : undefined,
        );
      return user;
    });
  }
  async loginMethodRequestCode(id: string, data: SendInput, ip: string | null) {
    return this.core.run(async (repo) => {
      const user = await this.core.current(repo, id);
      if (!user.email || !user.email_verified)
        throw new AppError(
          "validation_error",
          "A verified email is required to change the login method",
          { reason: "email_confirmation_required" },
        );
      await this.core.guard(repo, user.email, "change_login_method", ip, data);
      await this.core.issue(repo, user.email, "change_login_method", id);
      return { contact: user.email, expires_in_seconds: this.core.ttl() };
    });
  }
  async setLoginMethod(
    id: string,
    data: {
      method: LoginMethod;
      code: string;
    },
  ): Promise<User> {
    return this.core.run(async (repo) => {
      const user = await this.core.current(repo, id);
      if (["code", "two_factor"].includes(data.method) && !user.email_verified)
        throw new AppError("validation_error", "Confirm your email first", {
          reason: "email_confirmation_required",
        });
      if (["password", "two_factor"].includes(data.method) && !user.password_hash)
        throw new AppError("validation_error", "Set a password first", {
          reason: "password_required",
        });
      if (!user.email)
        throw new AppError(
          "validation_error",
          "A verified email is required to change the login method",
          { reason: "email_confirmation_required" },
        );
      await this.core.check(repo, "change_login_method", data.code, user.email, id);
      user.login_method = data.method;
      await repo.saveUser(user);
      return user;
    });
  }
}
