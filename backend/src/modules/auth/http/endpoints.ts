import type { AuthApplication } from "../application/service.js";
import type { User } from "../domain/ports.js";
import * as s from "./schemas.js";
import {
  endpoint,
  OkResponse,
  requireUserId,
  type Endpoint,
  type EndpointPolicy,
} from "../../../endpoint.js";

/**
 * The account as the contract describes it. `has_password` is derived rather than stored,
 * and the timestamps are strings on the wire — neither belongs in the domain entity.
 */
const userOut = (user: User) => ({
  id: user.id,
  email: user.email,
  phone: user.phone,
  role: user.role,
  referral_code: user.referral_code,
  email_verified: user.email_verified,
  phone_verified: user.phone_verified,
  has_password: user.password_hash !== null,
  login_method: user.login_method,
  verification_deadline_at: user.verification_deadline_at?.toISOString() ?? null,
  created_at: user.created_at.toISOString(),
});

/** Replaces the domain user in a result with its wire form, leaving the rest untouched. */
const authOut = <T extends { user: User; tokens: unknown }>(result: T) => ({
  ...result,
  user: userOut(result.user),
});
const meOut = <T extends { user: User; profile: unknown }>(result: T) => ({
  ...result,
  user: userOut(result.user),
});
const done = () => ({ ok: true });

/**
 * The three shapes every operation here takes, spread into each declaration.
 *
 * Named because they genuinely are the same policy repeated, not because the fields are
 * tedious: everything under /auth is public and rate limited, everything under /users/me is
 * behind a bearer token, and the only split within /auth is whether the operation can reject
 * a credential.
 */
const anonymous = {
  security: [],
  tags: ["auth"],
  errors: [404, 409, 422, 429],
} satisfies EndpointPolicy;
/** Anonymous, but also rejecting a bad credential or a spent token. */
const anonymousAuthenticating = {
  ...anonymous,
  errors: [401, 404, 409, 422, 429],
} satisfies EndpointPolicy;
/** The signed-in user's own account, behind a bearer token. */
const me = {
  security: [{ HTTPBearer: [] }],
  tags: ["users"],
  errors: [401, 404, 409, 422, 429],
} satisfies EndpointPolicy;

/**
 * Registration, sign-in and the signed-in user's own account — one declaration per operation.
 *
 * Each entry pairs the route with the handler that implements it, so an operationId, a path
 * and a body schema are named once and cannot drift between two files.
 */
export function authEndpoints(application: AuthApplication, captchaSiteKey?: string): Endpoint[] {
  return [
    endpoint({
      security: [],
      tags: ["auth"],
      method: "get",
      path: "/api/v1/auth/captcha-config",
      operationId: "auth_captcha_config",
      summary: "Public CAPTCHA configuration",
      ok: s.CaptchaConfigOut,
      handler: async () => ({ site_key: captchaSiteKey ?? null }),
    }),
    endpoint({
      ...anonymousAuthenticating,
      method: "post",
      path: "/api/v1/auth/login",
      operationId: "auth_login",
      summary: "Login",
      body: s.LoginRequest,
      ok: s.AuthResponse,
      handler: async (input) => authOut(await application.login(input.body, input.ip)),
    }),
    endpoint({
      ...anonymous,
      method: "post",
      path: "/api/v1/auth/login/request-code",
      operationId: "auth_login_request_code",
      summary: "Login Request Code",
      body: s.LoginCodeRequest,
      ok: s.LoginCodeResponse,
      handler: async (input) => application.loginRequestCode(input.body, input.ip),
    }),
    endpoint({
      ...anonymous,
      method: "post",
      path: "/api/v1/auth/login/verify-code",
      operationId: "auth_login_verify_code",
      summary: "Login Verify Code",
      body: s.LoginCodeVerifyRequest,
      ok: s.LoginCodeVerifyResponse,
      handler: async (input) => {
        const result = await application.loginVerifyCode(input.body);
        return { ...result, auth: result.auth ? authOut(result.auth) : null };
      },
    }),
    endpoint({
      ...anonymous,
      method: "post",
      path: "/api/v1/auth/logout",
      operationId: "auth_logout",
      summary: "Logout",
      body: s.LogoutRequest,
      ok: OkResponse,
      handler: async (input) => {
        await application.logout(input.body.refresh_token);
        return done();
      },
    }),
    endpoint({
      ...anonymousAuthenticating,
      method: "post",
      path: "/api/v1/auth/password-reset/confirm",
      operationId: "auth_confirm_password_reset",
      summary: "Confirm Password Reset",
      body: s.PasswordResetConfirmRequest,
      ok: OkResponse,
      handler: async (input) => {
        await application.confirmPasswordReset(input.body);
        return done();
      },
    }),
    endpoint({
      ...anonymous,
      method: "post",
      path: "/api/v1/auth/password-reset/request",
      operationId: "auth_request_password_reset",
      summary: "Request Password Reset",
      body: s.PasswordResetRequest,
      ok: OkResponse,
      handler: async (input) => {
        await application.requestPasswordReset(input.body, input.ip);
        return done();
      },
    }),
    endpoint({
      ...anonymousAuthenticating,
      method: "post",
      path: "/api/v1/auth/refresh",
      operationId: "auth_refresh",
      summary: "Refresh",
      body: s.RefreshRequest,
      ok: s.TokenPair,
      handler: async (input) => application.refresh(input.body.refresh_token),
    }),
    endpoint({
      ...anonymous,
      method: "post",
      path: "/api/v1/auth/register",
      operationId: "auth_register",
      summary: "Register",
      body: s.RegisterRequest,
      status: 201,
      ok: s.RegisterResponse,
      handler: async (input) => application.register(input.body, input.ip),
    }),
    endpoint({
      ...anonymous,
      method: "post",
      path: "/api/v1/auth/register/verify",
      operationId: "auth_register_verify",
      summary: "Register Verify",
      body: s.RegisterVerifyRequest,
      ok: s.AuthResponse,
      handler: async (input) => authOut(await application.registerVerify(input.body)),
    }),
    endpoint({
      ...anonymous,
      method: "post",
      path: "/api/v1/auth/resend-code",
      operationId: "auth_resend_code",
      summary: "Resend Code",
      body: s.ResendCodeRequest,
      ok: OkResponse,
      handler: async (input) => {
        await application.resendCode(input.body, input.ip);
        return done();
      },
    }),
    endpoint({
      ...anonymousAuthenticating,
      method: "post",
      path: "/api/v1/auth/set-password",
      operationId: "auth_set_password",
      summary: "Set Password",
      body: s.SetPasswordRequest,
      ok: s.AuthResponse,
      handler: async (input) => authOut(await application.setPassword(input.body)),
    }),
    endpoint({
      ...anonymous,
      method: "post",
      path: "/api/v1/auth/verify-code",
      operationId: "auth_verify_code",
      summary: "Verify Code",
      body: s.VerifyCodeRequest,
      ok: s.VerifyCodeResponse,
      handler: async (input) => application.verifyCode(input.body),
    }),
    endpoint({
      ...me,
      method: "get",
      path: "/api/v1/users/me",
      operationId: "users_get_me",
      summary: "Get Me",
      ok: s.MeOut,
      handler: async (input) => meOut(await application.getMe(requireUserId(input))),
    }),
    endpoint({
      ...me,
      method: "patch",
      path: "/api/v1/users/me",
      operationId: "users_update_me",
      summary: "Update Me",
      body: s.UpdateMeRequest,
      ok: s.MeOut,
      handler: async (input) => meOut(await application.updateMe(requireUserId(input), input.body)),
    }),
    endpoint({
      ...me,
      method: "post",
      path: "/api/v1/users/me/change-password",
      operationId: "users_change_password",
      summary: "Change Password",
      body: s.ChangePasswordRequest,
      ok: OkResponse,
      handler: async (input) => {
        await application.changePassword(requireUserId(input), input.body);
        return done();
      },
    }),
    endpoint({
      ...me,
      method: "post",
      path: "/api/v1/users/me/contact/change-confirm",
      operationId: "users_contact_change_confirm",
      summary: "Contact Change Confirm",
      body: s.ContactChangeConfirmRequest,
      ok: s.UserOut,
      handler: async (input) =>
        userOut(await application.contactChangeConfirm(requireUserId(input), input.body)),
    }),
    endpoint({
      ...me,
      method: "post",
      path: "/api/v1/users/me/contact/change-request",
      operationId: "users_contact_change_request",
      summary: "Contact Change Request",
      body: s.ContactChangeRequest,
      ok: s.ContactCodeResponse,
      handler: async (input) =>
        application.contactChangeRequest(requireUserId(input), input.body, input.ip),
    }),
    endpoint({
      ...me,
      method: "post",
      path: "/api/v1/users/me/contact/verify-confirm",
      operationId: "users_contact_verify_confirm",
      summary: "Contact Verify Confirm",
      body: s.ContactVerifyConfirmRequest,
      ok: s.UserOut,
      handler: async (input) =>
        userOut(await application.contactVerifyConfirm(requireUserId(input), input.body)),
    }),
    endpoint({
      ...me,
      method: "post",
      path: "/api/v1/users/me/contact/verify-request",
      operationId: "users_contact_verify_request",
      summary: "Contact Verify Request",
      body: s.ContactVerifyRequest,
      ok: s.ContactCodeResponse,
      handler: async (input) =>
        application.contactVerifyRequest(requireUserId(input), input.body, input.ip),
    }),
    endpoint({
      ...me,
      method: "post",
      path: "/api/v1/users/me/delete-confirm",
      operationId: "users_delete_confirm",
      summary: "Delete Confirm",
      body: s.DeleteAccountConfirmRequest,
      ok: OkResponse,
      handler: async (input) => {
        await application.deleteConfirm(requireUserId(input), input.body);
        return done();
      },
    }),
    endpoint({
      ...me,
      method: "post",
      path: "/api/v1/users/me/delete-request",
      operationId: "users_delete_request",
      summary: "Delete Request",
      body: s.DeleteAccountRequest,
      ok: s.DeleteAccountRequestResponse,
      handler: async (input) =>
        application.deleteRequest(requireUserId(input), input.body, input.ip),
    }),
    endpoint({
      ...me,
      method: "put",
      path: "/api/v1/users/me/login-method",
      operationId: "users_set_login_method",
      summary: "Set Login Method",
      body: s.SetLoginMethodRequest,
      ok: s.UserOut,
      handler: async (input) =>
        userOut(await application.setLoginMethod(requireUserId(input), input.body)),
    }),
    endpoint({
      ...me,
      method: "post",
      path: "/api/v1/users/me/login-method/request-code",
      operationId: "users_login_method_request_code",
      summary: "Login Method Request Code",
      body: s.LoginMethodCodeRequest,
      ok: s.ContactCodeResponse,
      handler: async (input) =>
        application.loginMethodRequestCode(requireUserId(input), input.body, input.ip),
    }),
    endpoint({
      ...me,
      method: "post",
      path: "/api/v1/users/me/onboarding",
      operationId: "users_complete_onboarding",
      summary: "Complete Onboarding",
      body: s.OnboardingRequest,
      ok: s.MeOut,
      handler: async (input) =>
        meOut(await application.completeOnboarding(requireUserId(input), input.body)),
    }),
    endpoint({
      ...me,
      method: "get",
      path: "/api/v1/users/me/settings",
      operationId: "users_get_settings",
      summary: "Get Settings",
      ok: s.SettingsOut,
      handler: async (input) => application.getSettings(requireUserId(input)),
    }),
    endpoint({
      ...me,
      method: "put",
      path: "/api/v1/users/me/settings",
      operationId: "users_update_settings",
      summary: "Update Settings",
      body: s.UpdateSettingsRequest,
      ok: s.SettingsOut,
      handler: async (input) => application.updateSettings(requireUserId(input), input.body),
    }),
  ];
}
