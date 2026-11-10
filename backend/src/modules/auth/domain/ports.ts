import type { Principal } from "../../../domain/principal.js";
export type LoginMethod = "code" | "password" | "two_factor";
export type Purpose =
  | "register"
  | "password_reset"
  | "login"
  | "verify_email"
  | "verify_phone"
  | "change_email"
  | "change_phone"
  | "change_login_method"
  | "account_delete";
export interface User {
  id: string;
  email: string | null;
  phone: string | null;
  password_hash: string | null;
  role: Principal["role"];
  referral_code: string;
  email_verified: boolean;
  phone_verified: boolean;
  login_method: LoginMethod;
  verification_deadline_at: Date | null;
  personal_data_consent_at: Date | null;
  is_active: boolean;
  deactivated_at: Date | null;
  deactivation_reason: string | null;
  anonymized_at: Date | null;
  created_at: Date;
}
export interface Profile {
  first_name: string;
  last_name: string | null;
  middle_name: string | null;
  full_name: string;
  gender: "male" | "female" | null;
  birth_date: string | null;
  city: string | null;
  injuries: string | null;
  clients_per_month: number | null;
}
export interface Settings {
  theme: string;
  notifications_enabled: boolean;
  analytics_config: Record<string, unknown> | null;
}
export interface Code {
  id: string;
  contact: string;
  purpose: Purpose;
  user_id: string | null;
  code_hash: string;
  expires_at: Date;
  attempts: number;
  used_at: Date | null;
  created_at: Date;
}
export interface SendAttempt {
  contact: string;
  purpose: Purpose;
  ip: string | null;
  created_at: Date;
}
export interface RefreshToken {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
}
export interface AuthRepository {
  getUser(id: string, lock?: boolean): Promise<User | null>;
  getByContact(contact: string): Promise<User | null>;
  insertUser(user: User): Promise<void>;
  saveUser(user: User): Promise<void>;
  getProfile(userId: string): Promise<Profile | null>;
  saveProfile(userId: string, profile: Profile): Promise<void>;
  getSettings(userId: string): Promise<Settings | null>;
  saveSettings(userId: string, settings: Settings): Promise<void>;
  saveOnboardingMeasurement(
    userId: string,
    date: string,
    height: number,
    weight: number,
  ): Promise<void>;
  addCode(code: Code): Promise<void>;
  getCode(id: string): Promise<Code | null>;
  activeCode(purpose: Purpose, now: Date, contact?: string, userId?: string): Promise<Code | null>;
  markCodeUsed(id: string, now: Date): Promise<void>;
  incrementCodeAttempts(id: string): Promise<void>;
  deleteCode(id: string): Promise<void>;
  sendAttempts(contact: string, ip: string | null, since: Date): Promise<SendAttempt[]>;
  addSendAttempt(attempt: SendAttempt): Promise<void>;
  addRefresh(token: RefreshToken): Promise<void>;
  validRefresh(hash: string, now: Date): Promise<RefreshToken | null>;
  revokeRefresh(id: string, now: Date): Promise<void>;
  revokeSessions(userId: string, now: Date, keepHash?: string): Promise<void>;
  linkReferral(userId: string, inviteCode: string): Promise<void>;
  anonymize(user: User, now: Date, reason: "user_request" | "unverified_email"): Promise<string[]>;
}
export interface UnitOfWork {
  run<T>(work: (repository: AuthRepository) => Promise<T>): Promise<T>;
}
export interface Security {
  id(): string;
  randomCode(): string;
  randomToken(): string;
  referralCode(): string;
  hashToken(value: string): string;
  hashPassword(password: string): Promise<string>;
  verifyPassword(password: string, hash: string | null): Promise<boolean>;
  sign(type: string, payload: Record<string, unknown>, ttlSeconds: number): Promise<string>;
  decode(token: string, type: string): Promise<Record<string, unknown> | null>;
}
export interface NotificationSender {
  sendVerificationCode(contact: string, code: string, purpose: Purpose): Promise<void>;
}
export interface AuthConfig {
  jwtSecret: string;
  sender: NotificationSender;
  captcha?: {
    verify(token: string | null, ip: string | null): Promise<boolean>;
  };
  now?: () => Date;
  verificationCodeTtlSeconds?: number;
  verificationDeadlineDays?: number;
  verificationTokenTtlSeconds?: number;
  registrationTokenTtlSeconds?: number;
  twoFactorTokenTtlSeconds?: number;
  accessTokenTtlSeconds?: number;
  refreshTokenTtlSeconds?: number;
  codeSendMinIntervalSeconds?: number;
  codeSendMaxPerContactHour?: number;
  codeSendMaxPerContactDay?: number;
  codeSendMaxPerIpHour?: number;
  devVerificationCode?: string;
  /** Deterministic e2e sequence; runtime configuration refuses it in production. */
  rotateDevVerificationCode?: boolean;
  qualifyReferral?: (userId: string) => Promise<void>;
  deleteObject?: (key: string) => Promise<void>;
  onIntegrationError?: (error: unknown) => void;
}
