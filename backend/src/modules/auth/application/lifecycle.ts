import { AppError } from "../../../domain/error.js";
import type { User } from "../domain/ports.js";
import { AuthCore, type SendInput } from "./core.js";

/**
 * Ending an account: the user's own request, and the automatic removal of an account whose
 * email was never confirmed.
 *
 * Both paths anonymise rather than delete rows, and both return the storage keys of the
 * user's files so they can be removed after the transaction commits.
 */
export class AuthLifecycle {
  constructor(private readonly core: AuthCore) {}

  private deleteByPassword(user: User): boolean {
    return !!user.password_hash && ["password", "two_factor"].includes(user.login_method);
  }
  async anonymizeOverdue(id: string): Promise<boolean> {
    const keys = await this.core.run(async (repo) => {
      const user = await repo.getUser(id, true);
      if (
        !user?.is_active ||
        user.email_verified ||
        !user.verification_deadline_at ||
        user.verification_deadline_at > this.core.now()
      )
        return null;
      return repo.anonymize(user, this.core.now(), "unverified_email");
    });
    if (keys === null) return false;
    await this.deleteObjects(keys);
    return true;
  }
  private async deleteObjects(keys: string[]): Promise<void> {
    for (const key of keys) {
      try {
        await this.core.config.deleteObject?.(key);
      } catch (error) {
        this.core.config.onIntegrationError?.(error);
      }
    }
  }
  /**
   * How the caller must confirm deleting their account, as `DeleteAccountRequestResponse`
   * documents it. The return type is spelled out because the two branches below return string
   * literals, which inference widens to `string` — losing the fact that this only ever answers
   * with the two values the contract's enum lists.
   */
  async deleteRequest(
    id: string,
    data: SendInput,
    ip: string | null,
  ): Promise<{ confirmation: "code" | "password"; expires_in_seconds: number | null }> {
    return this.core.run(async (repo) => {
      const user = await this.core.current(repo, id);
      if (this.deleteByPassword(user))
        return { confirmation: "password", expires_in_seconds: null };
      if (!user.email)
        throw new AppError("validation_error", "The account has no email to send the code to", {
          reason: "email_required",
        });
      await this.core.guard(repo, user.email, "account_delete", ip, data);
      await this.core.issue(repo, user.email, "account_delete", id);
      return { confirmation: "code", expires_in_seconds: this.core.ttl() };
    });
  }
  async deleteConfirm(
    id: string,
    data: {
      password?: string | null;
      code?: string | null;
    },
  ): Promise<void> {
    const keys = await this.core.run(async (repo) => {
      const user = await this.core.current(repo, id);
      if (this.deleteByPassword(user)) {
        if (
          !data.password ||
          !(await this.core.security.verifyPassword(data.password, user.password_hash))
        )
          throw new AppError("unauthorized", "Invalid password", { reason: "invalid_password" });
      } else {
        if (!data.code)
          throw new AppError("validation_error", "Code is required", { reason: "code_required" });
        await this.core.check(
          repo,
          "account_delete",
          data.code,
          this.core.contactOf(user, "email"),
          id,
        );
      }
      return repo.anonymize(user, this.core.now(), "user_request");
    });
    await this.deleteObjects(keys);
  }
}
