import { newPasswordSchema } from '@/shared/lib/validation/password';
import { HttpResponse, http } from 'msw';

import type { components } from '@/shared/api/schema';
import { env } from '@/shared/config/env';

type AuthResponse = components['schemas']['AuthResponse'];
type ErrorResponse = components['schemas']['ErrorResponse'];
type LoginCodeRequest = components['schemas']['LoginCodeRequest'];
type LoginCodeVerifyRequest = components['schemas']['LoginCodeVerifyRequest'];
type LoginRequest = components['schemas']['LoginRequest'];
type PasswordResetConfirmRequest = components['schemas']['PasswordResetConfirmRequest'];
type RegisterRequest = components['schemas']['RegisterRequest'];
type RegisterVerifyRequest = components['schemas']['RegisterVerifyRequest'];
type SetPasswordRequest = components['schemas']['SetPasswordRequest'];
type UserOut = components['schemas']['UserOut'];
type VerifyCodeRequest = components['schemas']['VerifyCodeRequest'];

/** Same demo accounts as backend seeds, so mock and real flows feel identical. */
export const MOCK_PASSWORD = 'Dopafit1Demo';
/** Dev OTP accepted by the backend in dev mode and by these mocks. */
export const MOCK_CODE = '000000';

const DAY_MS = 86_400_000;

interface MockAccount {
  user: UserOut;
  password: string | null;
}

function baseUser(overrides: Partial<UserOut>): UserOut {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'client@dopafit.dev',
    phone: null,
    role: 'client',
    referral_code: 'DOPA0001',
    email_verified: true,
    phone_verified: false,
    has_password: true,
    login_method: 'password',
    verification_deadline_at: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function demoAccounts(): Map<string, MockAccount> {
  return new Map<string, MockAccount>([
    [
      'client@dopafit.dev',
      {
        password: MOCK_PASSWORD,
        user: baseUser({ phone: '+79990000001', phone_verified: true }),
      },
    ],
    [
      'trainer@dopafit.dev',
      {
        password: MOCK_PASSWORD,
        user: baseUser({
          id: '22222222-2222-4222-8222-222222222222',
          email: 'trainer@dopafit.dev',
          phone: '+79990000002',
          phone_verified: true,
          role: 'trainer',
          referral_code: 'DOPA0002',
        }),
      },
    ],
    [
      'code@dopafit.dev',
      {
        password: null,
        user: baseUser({
          id: '33333333-3333-4333-8333-000000000001',
          email: 'code@dopafit.dev',
          referral_code: 'DOPA0003',
          has_password: false,
          login_method: 'code',
        }),
      },
    ],
    [
      'twofactor@dopafit.dev',
      {
        password: MOCK_PASSWORD,
        user: baseUser({
          id: '44444444-4444-4444-8444-000000000001',
          email: 'twofactor@dopafit.dev',
          referral_code: 'DOPA0004',
          login_method: 'two_factor',
        }),
      },
    ],
  ]);
}

let accounts = demoAccounts();
let userCounter = 100;

export function resetSessionMocks(): void {
  accounts = demoAccounts();
  userCounter = 100;
}

function authResponse(user: UserOut): AuthResponse {
  return {
    user,
    tokens: {
      access_token: `mock-access-${user.id}`,
      refresh_token: `mock-refresh-${user.id}`,
      token_type: 'bearer',
    },
  };
}

const unauthorized: ErrorResponse = {
  code: 'unauthorized',
  message: 'Invalid credentials',
  details: { reason: 'invalid_credentials' },
};
const invalidCode: ErrorResponse = {
  code: 'validation_error',
  message: 'Invalid verification code',
  details: { field: 'code', reason: 'invalid_verification_code' },
};
const notFound: ErrorResponse = {
  code: 'not_found',
  message: 'Verification code not found or expired',
  details: { reason: 'verification_code_expired' },
};
const conflict: ErrorResponse = {
  code: 'conflict',
  message: 'User with this email already exists',
  details: { reason: 'email_taken' },
};
// The real backend (modules/auth/application/registration.ts) rejects a
// registration whose personal_data_consent is not truthy. Mirroring that here
// keeps the happy-path registration tests as the regression guard for the
// field — without it, dropping it from the request would break production
// while every test stayed green.
const consentRequired: ErrorResponse = {
  code: 'validation_error',
  message: 'Personal data consent is required',
  details: { field: 'personal_data_consent' },
};

const registrationToken = (email: string) => `mock-registration-${email}`;
const challengeToken = (email: string) => `mock-challenge-${email}`;
const isCompleted = (account: MockAccount) =>
  account.user.email_verified || account.user.has_password;

export const sessionHandlers = [
  http.get(`${env.apiUrl}/api/v1/auth/captcha-config`, () => HttpResponse.json({ site_key: null })),
  http.post(`${env.apiUrl}/api/v1/auth/register`, async ({ request }) => {
    const body = (await request.json()) as RegisterRequest;
    if (body.personal_data_consent !== true) {
      return HttpResponse.json(consentRequired, { status: 422 });
    }
    const existing = accounts.get(body.email);
    if (existing && isCompleted(existing)) {
      return HttpResponse.json(conflict, { status: 409 });
    }
    userCounter += 1;
    accounts.set(body.email, {
      password: null,
      user: baseUser({
        id: `55555555-5555-4555-8555-${String(userCounter).padStart(12, '0')}`,
        email: body.email,
        role: body.role,
        referral_code: `DOPA${String(userCounter).padStart(4, '0')}`,
        email_verified: false,
        has_password: false,
        login_method: 'code',
        verification_deadline_at: new Date(Date.now() + 90 * DAY_MS).toISOString(),
        created_at: new Date().toISOString(),
      }),
    });
    return HttpResponse.json(
      {
        contact: body.email,
        expires_in_seconds: 600,
        registration_token: registrationToken(body.email),
      },
      { status: 201 },
    );
  }),

  http.post(`${env.apiUrl}/api/v1/auth/register/verify`, async ({ request }) => {
    const body = (await request.json()) as RegisterVerifyRequest;
    const account = accounts.get(body.email);
    if (!account) {
      return HttpResponse.json(notFound, { status: 404 });
    }
    if (body.code !== MOCK_CODE) {
      return HttpResponse.json(invalidCode, { status: 422 });
    }
    account.user.email_verified = true;
    account.user.verification_deadline_at = null;
    return HttpResponse.json(authResponse(account.user));
  }),

  http.post(`${env.apiUrl}/api/v1/auth/set-password`, async ({ request }) => {
    const body = (await request.json()) as SetPasswordRequest;
    const entry = [...accounts.entries()].find(
      ([email]) => registrationToken(email) === body.registration_token,
    );
    if (!entry) {
      return HttpResponse.json(unauthorized, { status: 401 });
    }
    const [, account] = entry;
    if (!newPasswordSchema.safeParse(body.password).success)
      return HttpResponse.json(
        {
          code: 'validation_error',
          message: 'Invalid new password',
          details: { reason: 'invalid_new_password' },
        },
        { status: 422 },
      );
    if (isCompleted(account)) {
      return HttpResponse.json(conflict, { status: 409 });
    }
    account.password = body.password;
    account.user.has_password = true;
    account.user.login_method = 'password';
    return HttpResponse.json(authResponse(account.user));
  }),

  http.post(`${env.apiUrl}/api/v1/auth/login/request-code`, async ({ request }) => {
    // Anti-enumeration: identical 200 for known and unknown contacts.
    (await request.json()) as LoginCodeRequest;
    return HttpResponse.json({ expires_in_seconds: 600 });
  }),

  http.post(`${env.apiUrl}/api/v1/auth/login/verify-code`, async ({ request }) => {
    const body = (await request.json()) as LoginCodeVerifyRequest;
    const account = accounts.get(body.contact);
    // Password-method users never receive a login code (service letter instead).
    if (!account || (account.user.has_password && account.user.login_method === 'password')) {
      return HttpResponse.json(notFound, { status: 404 });
    }
    if (body.code !== MOCK_CODE) {
      return HttpResponse.json(invalidCode, { status: 422 });
    }
    // Owning the mailbox proves identity (recovery rule).
    account.user.email_verified = true;
    account.user.verification_deadline_at = null;
    if (account.user.login_method === 'two_factor') {
      return HttpResponse.json({
        two_factor_required: true,
        challenge_token: challengeToken(body.contact),
        auth: null,
      });
    }
    return HttpResponse.json({
      two_factor_required: false,
      challenge_token: null,
      auth: authResponse(account.user),
    });
  }),

  http.post(`${env.apiUrl}/api/v1/auth/login`, async ({ request }) => {
    const body = (await request.json()) as LoginRequest;
    const account = accounts.get(body.contact);
    if (!account || account.password !== body.password || account.user.login_method === 'code') {
      return HttpResponse.json(unauthorized, { status: 401 });
    }
    if (
      account.user.login_method === 'two_factor' &&
      body.challenge_token !== challengeToken(body.contact)
    ) {
      return HttpResponse.json(unauthorized, { status: 401 });
    }
    return HttpResponse.json(authResponse(account.user));
  }),

  http.post(`${env.apiUrl}/api/v1/auth/resend-code`, async ({ request }) => {
    await request.json();
    return HttpResponse.json({ ok: true });
  }),

  http.post(`${env.apiUrl}/api/v1/auth/password-reset/request`, async ({ request }) => {
    // Uniform 200 regardless of account existence (anti-enumeration).
    await request.json();
    return HttpResponse.json({ ok: true });
  }),

  http.post(`${env.apiUrl}/api/v1/auth/verify-code`, async ({ request }) => {
    const body = (await request.json()) as VerifyCodeRequest;
    if (body.purpose !== 'password_reset') {
      return HttpResponse.json(
        {
          code: 'validation_error',
          message: 'This purpose is confirmed via its own endpoint',
          details: null,
        } satisfies ErrorResponse,
        { status: 422 },
      );
    }
    if (!accounts.has(body.contact)) {
      return HttpResponse.json(notFound, { status: 404 });
    }
    if (body.code !== MOCK_CODE) {
      return HttpResponse.json(invalidCode, { status: 422 });
    }
    return HttpResponse.json({ verification_token: `mock-reset-${body.contact}` });
  }),

  http.post(`${env.apiUrl}/api/v1/auth/password-reset/confirm`, async ({ request }) => {
    const body = (await request.json()) as PasswordResetConfirmRequest;
    const email = body.verification_token.replace('mock-reset-', '');
    const account = accounts.get(email);
    if (!account || email === body.verification_token) {
      return HttpResponse.json(unauthorized, { status: 401 });
    }
    if (!newPasswordSchema.safeParse(body.new_password).success)
      return HttpResponse.json(
        {
          code: 'validation_error',
          message: 'Invalid new password',
          details: { reason: 'invalid_new_password' },
        },
        { status: 422 },
      );
    account.password = body.new_password;
    account.user.has_password = true;
    return HttpResponse.json({ ok: true });
  }),

  http.post(`${env.apiUrl}/api/v1/auth/logout`, () => HttpResponse.json({ ok: true })),

  http.post(`${env.apiUrl}/api/v1/auth/refresh`, () =>
    HttpResponse.json({
      access_token: 'mock-access-refreshed',
      refresh_token: 'mock-refresh-refreshed',
      token_type: 'bearer',
    }),
  ),
];
