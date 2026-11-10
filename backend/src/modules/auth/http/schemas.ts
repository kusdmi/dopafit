import { PASSWORD_PATTERN, PASSWORD_REQUIREMENTS } from "../domain/rules.js";
import { z } from "@hono/zod-openapi";
import { AccountRole, PHONE_PATTERN } from "../../../endpoint.js";

/**
 * The DTOs only auth's operations name — registration, sign-in, verification codes and the
 * signed-in user's own account and settings.
 *
 * Each is referenced by this module's endpoint declarations alone, which is what makes the
 * module the right owner: a DTO shared with another module has no owner to move to. The two
 * exceptions in the closure below are AccountRole, which link requests name too, and
 * PHONE_PATTERN, which training's client cards validate against: both live in
 * src/endpoint.ts beside the other shared declaration vocabulary, where auth and training
 * reach them without either importing the other's schemas.
 *
 * Relative order is the one they held there, since nothing depends on it — `createContract`
 * discovers schemas by walking the routes, and the emitted components are sorted by name.
 */

/**
 * The email pattern, shared by the schemas that accept an address.
 *
 * Written with `new RegExp` and the literal source it was generated with: the pattern string
 * is emitted verbatim into the contract as `pattern`, so rewriting it as a regex literal —
 * however much tidier — would change what generated clients validate against. It stays here
 * because auth is its only caller; PHONE_PATTERN, which training also validates against, sits
 * in src/endpoint.ts instead of being declared once in each module.
 */
const EMAIL_PATTERN = new RegExp("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");

export const CaptchaConfigOut = z
  .object({ site_key: z.string().nullable() })
  .openapi("CaptchaConfigOut");

/** Onboarding accepts a birth date whose implied age stays inside these bounds. */
const MIN_ONBOARDING_AGE = 10;
const MAX_ONBOARDING_AGE = 120;

/**
 * Onboarding's birth date carries the age bounds the field used to state as `age` min/max.
 *
 * The bound is relative to today, so it cannot be an OpenAPI `minimum`/`maximum` the way the
 * old integer field's was: JSON Schema has no way to express "within N years of now". It is
 * enforced here as a refinement and stated for clients in the field's `description`, since a
 * refinement contributes nothing to the emitted contract.
 */
function withinOnboardingAgeRange(value: string) {
  const birth = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(birth.getTime())) return false;
  const now = new Date();
  const earliest = new Date(
    Date.UTC(now.getUTCFullYear() - MAX_ONBOARDING_AGE, now.getUTCMonth(), now.getUTCDate()),
  );
  const latest = new Date(
    Date.UTC(now.getUTCFullYear() - MIN_ONBOARDING_AGE, now.getUTCMonth(), now.getUTCDate()),
  );
  return birth >= earliest && birth <= latest;
}

export const TokenPair = z
  .object({
    access_token: z.string(),
    refresh_token: z.string(),
    token_type: z.string().default("bearer").optional(),
  })
  .openapi("TokenPair");
export const LoginMethod = z.enum(["code", "password", "two_factor"]).openapi("LoginMethod");
export const UserOut = z
  .object({
    created_at: z.string().datetime({ offset: true }),
    email: z.union([z.string(), z.null()]),
    email_verified: z.boolean(),
    has_password: z.boolean(),
    id: z.string().uuid(),
    login_method: LoginMethod,
    phone: z.union([z.string(), z.null()]),
    phone_verified: z.boolean(),
    referral_code: z.string(),
    role: AccountRole,
    verification_deadline_at: z.union([z.string().datetime({ offset: true }), z.null()]),
  })
  .openapi("UserOut");
export const AuthResponse = z.object({ tokens: TokenPair, user: UserOut }).openapi("AuthResponse");
const NewPassword = z
  .string()
  .min(8, PASSWORD_REQUIREMENTS)
  .max(32, PASSWORD_REQUIREMENTS)
  .regex(PASSWORD_PATTERN, PASSWORD_REQUIREMENTS)
  .describe(
    "8–32 characters, at least one uppercase Latin letter, one lowercase Latin letter and one digit; additional characters allowed",
  );

export const ChangePasswordRequest = z
  .object({
    current_password: z.union([z.string(), z.null()]).optional(),
    new_password: NewPassword,
  })
  .openapi("ChangePasswordRequest");
export const ContactType = z.enum(["email", "phone"]).openapi("ContactType");
export const ContactChangeConfirmRequest = z
  .object({
    code: z.string().min(4).max(6),
    refresh_token: z.union([z.string(), z.null()]).optional(),
    type: ContactType,
  })
  .openapi("ContactChangeConfirmRequest");
export const ContactChangeRequest = z
  .object({
    captcha_token: z.union([z.string(), z.null()]).optional(),
    new_contact: z.string(),
    type: ContactType,
  })
  .openapi("ContactChangeRequest");
export const ContactCodeResponse = z
  .object({ contact: z.string(), expires_in_seconds: z.number().int() })
  .openapi("ContactCodeResponse");
export const ContactVerifyConfirmRequest = z
  .object({ code: z.string().min(4).max(6), type: ContactType })
  .openapi("ContactVerifyConfirmRequest");
export const ContactVerifyRequest = z
  .object({ captcha_token: z.union([z.string(), z.null()]).optional(), type: ContactType })
  .openapi("ContactVerifyRequest");
export const DeleteAccountConfirmRequest = z
  .object({
    code: z.union([z.string().min(4).max(6), z.null()]).optional(),
    password: z.union([z.string(), z.null()]).optional(),
  })
  .openapi("DeleteAccountConfirmRequest");
export const DeleteAccountRequest = z
  .object({ captcha_token: z.union([z.string(), z.null()]).optional() })
  .openapi("DeleteAccountRequest");
export const DeleteConfirmationMethod = z
  .enum(["code", "password"])
  .openapi("DeleteConfirmationMethod");
export const DeleteAccountRequestResponse = z
  .object({
    confirmation: DeleteConfirmationMethod,
    expires_in_seconds: z.union([z.number().int(), z.null()]).optional(),
  })
  .openapi("DeleteAccountRequestResponse");
export const Gender = z.enum(["male", "female"]).openapi("Gender");
export const LoginCodeRequest = z
  .object({
    captcha_token: z.union([z.string(), z.null()]).optional(),
    contact: z.string().describe("Email (or phone in E.164 — reserved for the future)"),
  })
  .openapi("LoginCodeRequest");
export const LoginCodeResponse = z
  .object({ expires_in_seconds: z.number().int() })
  .openapi("LoginCodeResponse");
export const LoginCodeVerifyRequest = z
  .object({ code: z.string().min(4).max(6), contact: z.string() })
  .openapi("LoginCodeVerifyRequest");
export const LoginCodeVerifyResponse = z
  .object({
    auth: z.union([AuthResponse, z.null()]).optional(),
    challenge_token: z.union([z.string(), z.null()]).optional(),
    two_factor_required: z.boolean().default(false).optional(),
  })
  .openapi("LoginCodeVerifyResponse");
export const LoginMethodCodeRequest = z
  .object({ captcha_token: z.union([z.string(), z.null()]).optional() })
  .openapi("LoginMethodCodeRequest");
export const LoginRequest = z
  .object({
    captcha_token: z.string().max(16384).nullable().optional(),
    challenge_token: z.union([z.string(), z.null()]).optional(),
    contact: z.string().describe("Email (or phone in E.164 — reserved for the future)"),
    password: z.string(),
  })
  .openapi("LoginRequest");
export const LogoutRequest = z.object({ refresh_token: z.string() }).openapi("LogoutRequest");
export const ProfileOut = z
  .object({
    birth_date: z.union([z.string().date(), z.null()]),
    city: z.union([z.string(), z.null()]),
    clients_per_month: z.union([z.number().int(), z.null()]),
    full_name: z.string(),
    first_name: z.string(),
    last_name: z.string().nullable(),
    middle_name: z.string().nullable(),
    gender: z.union([Gender, z.null()]),
    injuries: z.union([z.string(), z.null()]),
  })
  .openapi("ProfileOut");
export const MeOut = z.object({ profile: ProfileOut, user: UserOut }).openapi("MeOut");
export const OnboardingRequest = z
  .object({
    birth_date: z
      .string()
      .date()
      .refine(withinOnboardingAgeRange, "Birth date must place the age between 10 and 120 years")
      .describe("ISO date (YYYY-MM-DD); the age it implies must be between 10 and 120 years"),
    clients_per_month: z.union([z.number().int().min(0).max(1000), z.null()]).optional(),
    gender: Gender,
    height: z.number().min(100).max(250),
    weight: z.number().min(20).max(300),
  })
  .openapi("OnboardingRequest");
export const PasswordResetConfirmRequest = z
  .object({
    new_password: NewPassword,
    verification_token: z.string(),
  })
  .openapi("PasswordResetConfirmRequest");
export const PasswordResetRequest = z
  .object({ captcha_token: z.union([z.string(), z.null()]).optional(), contact: z.string() })
  .openapi("PasswordResetRequest");
export const RefreshRequest = z.object({ refresh_token: z.string() }).openapi("RefreshRequest");
export const RegisterRequest = z
  .object({
    captcha_token: z.union([z.string(), z.null()]).optional(),
    email: z.string().regex(EMAIL_PATTERN),
    full_name: z.string().min(2).max(255),
    invite_code: z.union([z.string(), z.null()]).optional(),
    personal_data_consent: z.boolean(),
    role: AccountRole,
  })
  .openapi("RegisterRequest");
export const RegisterResponse = z
  .object({
    contact: z.string(),
    expires_in_seconds: z.number().int(),
    registration_token: z.string(),
  })
  .openapi("RegisterResponse");
export const RegisterVerifyRequest = z
  .object({
    code: z.string().min(4).max(6),
    email: z.string().regex(EMAIL_PATTERN),
  })
  .openapi("RegisterVerifyRequest");
export const VerificationPurpose = z
  .enum([
    "register",
    "password_reset",
    "login",
    "verify_email",
    "verify_phone",
    "change_email",
    "change_phone",
    "change_login_method",
    "account_delete",
  ])
  .openapi("VerificationPurpose");
export const ResendCodeRequest = z
  .object({
    captcha_token: z.union([z.string(), z.null()]).optional(),
    contact: z.string(),
    purpose: VerificationPurpose,
  })
  .openapi("ResendCodeRequest");
export const SetLoginMethodRequest = z
  .object({ code: z.string().min(4).max(6), method: LoginMethod })
  .openapi("SetLoginMethodRequest");
export const SetPasswordRequest = z
  .object({
    password: NewPassword,
    registration_token: z.string(),
  })
  .openapi("SetPasswordRequest");
export const SettingsOut = z
  .object({
    analytics_config: z.union([z.object({}).passthrough(), z.null()]).optional(),
    notifications_enabled: z.boolean(),
    theme: z.string(),
  })
  .openapi("SettingsOut");
export const UpdateMeRequest = z
  .object({
    first_name: z.string().trim().min(1).max(255).optional(),
    last_name: z.string().trim().max(255).nullable().optional(),
    middle_name: z.string().trim().max(255).nullable().optional(),
    birth_date: z.union([z.string().date(), z.null()]).optional(),
    city: z.union([z.string(), z.null()]).optional(),
    email: z.union([z.string().regex(EMAIL_PATTERN), z.null()]).optional(),
    full_name: z.union([z.string().min(2).max(255), z.null()]).optional(),
    gender: z.union([Gender, z.null()]).optional(),
    injuries: z.union([z.string(), z.null()]).optional(),
    phone: z.union([z.string().regex(PHONE_PATTERN), z.null()]).optional(),
  })
  .openapi("UpdateMeRequest");
export const UpdateSettingsRequest = z
  .object({
    analytics_config: z.union([z.object({}).passthrough(), z.null()]).optional(),
    notifications_enabled: z.union([z.boolean(), z.null()]).optional(),
    theme: z.union([z.string().regex(new RegExp("^(dark|light|system)$")), z.null()]).optional(),
  })
  .openapi("UpdateSettingsRequest");
export const VerifyCodeRequest = z
  .object({ code: z.string().min(4).max(6), contact: z.string(), purpose: VerificationPurpose })
  .openapi("VerifyCodeRequest");
export const VerifyCodeResponse = z
  .object({ verification_token: z.string() })
  .openapi("VerifyCodeResponse");
