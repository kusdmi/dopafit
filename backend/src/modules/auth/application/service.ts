import type { AuthConfig, Security, UnitOfWork } from "../domain/ports.js";
import { AuthCore, type TokenPair } from "./core.js";
import { AuthContacts } from "./contacts.js";
import { AuthLifecycle } from "./lifecycle.js";
import { AuthPasswords } from "./passwords.js";
import { AuthProfile } from "./profile.js";
import { AuthRegistration } from "./registration.js";
import { AuthSessions } from "./sessions.js";

// Re-exported so callers keep importing it from the service.
export type { TokenPair };

/**
 * The auth module's public surface: one façade over six use-case groups, all sharing a single
 * AuthCore that owns transactions, verification codes, rate limiting and token issuing.
 *
 * Every method here just forwards, and the signatures are derived with `Parameters<>` so they
 * cannot drift from the implementations. Add new behaviour to the group it belongs to, not
 * here.
 */
export class AuthApplication {
  private readonly core: AuthCore;
  private readonly registration: AuthRegistration;
  private readonly sessions: AuthSessions;
  private readonly contacts: AuthContacts;
  private readonly passwords: AuthPasswords;
  private readonly profile: AuthProfile;
  private readonly lifecycle: AuthLifecycle;

  constructor(uow: UnitOfWork, security: Security, config: AuthConfig) {
    this.core = new AuthCore(uow, security, config);
    this.registration = new AuthRegistration(this.core);
    this.sessions = new AuthSessions(this.core);
    this.contacts = new AuthContacts(this.core);
    this.passwords = new AuthPasswords(this.core);
    this.profile = new AuthProfile(this.core);
    this.lifecycle = new AuthLifecycle(this.core);
  }
  // --- Registration, implemented by AuthRegistration ---

  register(...args: Parameters<AuthRegistration["register"]>) {
    return this.registration.register(...args);
  }

  registerVerify(...args: Parameters<AuthRegistration["registerVerify"]>) {
    return this.registration.registerVerify(...args);
  }

  setPassword(...args: Parameters<AuthRegistration["setPassword"]>) {
    return this.registration.setPassword(...args);
  }

  // --- Sessions, implemented by AuthSessions ---

  /** Resolves an access token to its caller; the HTTP layer calls this on every request. */
  authenticate(...args: Parameters<AuthSessions["authenticate"]>) {
    return this.sessions.authenticate(...args);
  }

  login(...args: Parameters<AuthSessions["login"]>) {
    return this.sessions.login(...args);
  }

  loginRequestCode(...args: Parameters<AuthSessions["loginRequestCode"]>) {
    return this.sessions.loginRequestCode(...args);
  }

  loginVerifyCode(...args: Parameters<AuthSessions["loginVerifyCode"]>) {
    return this.sessions.loginVerifyCode(...args);
  }

  refresh(...args: Parameters<AuthSessions["refresh"]>) {
    return this.sessions.refresh(...args);
  }

  logout(...args: Parameters<AuthSessions["logout"]>) {
    return this.sessions.logout(...args);
  }

  // --- Passwords, implemented by AuthPasswords ---

  requestPasswordReset(...args: Parameters<AuthPasswords["requestPasswordReset"]>) {
    return this.passwords.requestPasswordReset(...args);
  }

  verifyCode(...args: Parameters<AuthPasswords["verifyCode"]>) {
    return this.passwords.verifyCode(...args);
  }

  confirmPasswordReset(...args: Parameters<AuthPasswords["confirmPasswordReset"]>) {
    return this.passwords.confirmPasswordReset(...args);
  }

  resendCode(...args: Parameters<AuthPasswords["resendCode"]>) {
    return this.passwords.resendCode(...args);
  }

  changePassword(...args: Parameters<AuthPasswords["changePassword"]>) {
    return this.passwords.changePassword(...args);
  }

  // --- Profile and settings, implemented by AuthProfile ---

  getMe(id: string) {
    return this.profile.getMe(id);
  }

  updateMe(...args: Parameters<AuthProfile["updateMe"]>) {
    return this.profile.updateMe(...args);
  }

  completeOnboarding(...args: Parameters<AuthProfile["completeOnboarding"]>) {
    return this.profile.completeOnboarding(...args);
  }

  getSettings(id: string) {
    return this.profile.getSettings(id);
  }

  updateSettings(...args: Parameters<AuthProfile["updateSettings"]>) {
    return this.profile.updateSettings(...args);
  }

  // --- Contacts and login method, implemented by AuthContacts ---

  contactVerifyRequest(...args: Parameters<AuthContacts["contactVerifyRequest"]>) {
    return this.contacts.contactVerifyRequest(...args);
  }

  contactVerifyConfirm(...args: Parameters<AuthContacts["contactVerifyConfirm"]>) {
    return this.contacts.contactVerifyConfirm(...args);
  }

  contactChangeRequest(...args: Parameters<AuthContacts["contactChangeRequest"]>) {
    return this.contacts.contactChangeRequest(...args);
  }

  contactChangeConfirm(...args: Parameters<AuthContacts["contactChangeConfirm"]>) {
    return this.contacts.contactChangeConfirm(...args);
  }

  loginMethodRequestCode(...args: Parameters<AuthContacts["loginMethodRequestCode"]>) {
    return this.contacts.loginMethodRequestCode(...args);
  }

  setLoginMethod(...args: Parameters<AuthContacts["setLoginMethod"]>) {
    return this.contacts.setLoginMethod(...args);
  }

  // --- Account lifecycle, implemented by AuthLifecycle ---

  /** Ends the account at the user's request, after confirming it is really them. */
  deleteRequest(...args: Parameters<AuthLifecycle["deleteRequest"]>) {
    return this.lifecycle.deleteRequest(...args);
  }

  deleteConfirm(...args: Parameters<AuthLifecycle["deleteConfirm"]>) {
    return this.lifecycle.deleteConfirm(...args);
  }

  /** Removes an account whose email stayed unconfirmed past its deadline. */
  anonymizeOverdue(id: string) {
    return this.lifecycle.anonymizeOverdue(id);
  }
}
