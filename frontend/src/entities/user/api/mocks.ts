import { newPasswordSchema } from '@/shared/lib/validation/password';
import { HttpResponse, http } from 'msw';

import type { components } from '@/shared/api/schema';
import { env } from '@/shared/config/env';

type MeOut = components['schemas']['MeOut'];
type OnboardingRequest = components['schemas']['OnboardingRequest'];
type UpdateMeRequest = components['schemas']['UpdateMeRequest'];
type SettingsOut = components['schemas']['SettingsOut'];
type UpdateSettingsRequest = components['schemas']['UpdateSettingsRequest'];
type ChangePasswordRequest = components['schemas']['ChangePasswordRequest'];
type ContactVerifyRequest = components['schemas']['ContactVerifyRequest'];
type ContactVerifyConfirmRequest = components['schemas']['ContactVerifyConfirmRequest'];
type ContactChangeRequest = components['schemas']['ContactChangeRequest'];
type ContactChangeConfirmRequest = components['schemas']['ContactChangeConfirmRequest'];
type SetLoginMethodRequest = components['schemas']['SetLoginMethodRequest'];
type DeleteAccountConfirmRequest = components['schemas']['DeleteAccountConfirmRequest'];

const MOCK_CODE = '000000';
const CURRENT_PASSWORD = 'Dopafit1Demo';
const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const phonePattern = /^\+\d{10,15}$/;

function defaultMe(): MeOut {
  return {
    user: {
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
    },
    profile: {
      birth_date: '1995-01-01',
      city: '',
      clients_per_month: null,
      full_name: 'Demo User',
      first_name: 'Demo',
      last_name: 'User',
      middle_name: null,
      gender: null,
      injuries: '',
    },
  };
}

let mockMe = defaultMe();
let pendingContactChange: { type: 'email' | 'phone'; value: string } | null = null;

/** Test hook: shape the current user before rendering a screen. */
export function setMockMe(
  user: Partial<MeOut['user']> = {},
  profile: Partial<MeOut['profile']> = {},
): void {
  mockMe = {
    user: { ...mockMe.user, ...user },
    profile: { ...mockMe.profile, ...profile },
  };
}

function defaultSettings(): SettingsOut {
  return {
    theme: 'system',
    notifications_enabled: true,
    analytics_config: null,
  };
}

let mockSettings: SettingsOut = defaultSettings();

export function resetUserMocks(): void {
  mockMe = defaultMe();
  mockSettings = defaultSettings();
  pendingContactChange = null;
}

const validationError = (message: string, reason?: string) =>
  HttpResponse.json(
    { code: 'validation_error', message, details: reason ? { reason } : null },
    { status: 422 },
  );
const conflictError = (message: string) =>
  HttpResponse.json({ code: 'conflict', message, details: null }, { status: 409 });

export const userHandlers = [
  http.get(`${env.apiUrl}/api/v1/users/me`, () => HttpResponse.json(mockMe)),

  http.patch(`${env.apiUrl}/api/v1/users/me`, async ({ request }) => {
    const body = (await request.json()) as UpdateMeRequest;
    if (body.email !== undefined && body.email !== mockMe.user.email) {
      if (mockMe.user.email_verified) {
        return conflictError('Verified email is changed via the contact change flow');
      }
      if (body.email === null) {
        return validationError('Email cannot be removed');
      }
      mockMe.user.email = body.email;
    }
    if (body.phone !== undefined && body.phone !== mockMe.user.phone) {
      if (mockMe.user.phone_verified)
        return conflictError('Verified phone is changed via the contact change flow');
      mockMe.user.phone = body.phone;
      mockMe.user.phone_verified = false;
    }
    mockMe = {
      user: { ...mockMe.user },
      profile: {
        ...mockMe.profile,
        first_name: body.first_name ?? mockMe.profile.first_name,
        last_name: body.last_name === undefined ? mockMe.profile.last_name : body.last_name,
        middle_name: body.middle_name === undefined ? mockMe.profile.middle_name : body.middle_name,
        birth_date: body.birth_date === undefined ? mockMe.profile.birth_date : body.birth_date,
        city: body.city === undefined ? mockMe.profile.city : body.city,
        full_name: body.full_name === undefined ? mockMe.profile.full_name : (body.full_name ?? ''),
        gender: body.gender === undefined ? mockMe.profile.gender : body.gender,
        injuries: body.injuries === undefined ? mockMe.profile.injuries : body.injuries,
      },
    };
    if (
      body.first_name !== undefined ||
      body.last_name !== undefined ||
      body.middle_name !== undefined
    )
      mockMe.profile.full_name = [
        mockMe.profile.last_name,
        mockMe.profile.first_name,
        mockMe.profile.middle_name,
      ]
        .filter(Boolean)
        .join(' ');
    return HttpResponse.json(mockMe);
  }),

  http.post(`${env.apiUrl}/api/v1/users/me/onboarding`, async ({ request }) => {
    const body = (await request.json()) as OnboardingRequest;
    // Реальный бэкенд (modules/auth/http/schemas.ts) требует birth_date и пишет
    // её в профиль как есть. Мок повторяет и требование, и запись: иначе
    // онбординг мог бы перестать слать дату, а тесты остались бы зелёными.
    if (!body.birth_date) {
      return validationError('Birth date is required');
    }
    mockMe = {
      user: { ...mockMe.user, role: body.clients_per_month === null ? 'client' : 'trainer' },
      profile: {
        ...mockMe.profile,
        birth_date: body.birth_date,
        clients_per_month: body.clients_per_month ?? null,
        gender: body.gender,
      },
    };
    return HttpResponse.json(mockMe);
  }),

  http.get(`${env.apiUrl}/api/v1/users/me/settings`, () => HttpResponse.json(mockSettings)),

  http.put(`${env.apiUrl}/api/v1/users/me/settings`, async ({ request }) => {
    const body = (await request.json()) as UpdateSettingsRequest;
    mockSettings = {
      ...mockSettings,
      theme: body.theme ?? mockSettings.theme,
      notifications_enabled: body.notifications_enabled ?? mockSettings.notifications_enabled,
      analytics_config:
        body.analytics_config === undefined ? mockSettings.analytics_config : body.analytics_config,
    };
    return HttpResponse.json(mockSettings);
  }),

  http.post(`${env.apiUrl}/api/v1/users/me/change-password`, async ({ request }) => {
    const body = (await request.json()) as ChangePasswordRequest;
    if (mockMe.user.has_password && body.current_password !== CURRENT_PASSWORD) {
      return validationError('Current password is incorrect', 'invalid_password');
    }
    if (!newPasswordSchema.safeParse(body.new_password).success) {
      return validationError('Invalid new password', 'invalid_new_password');
    }
    setMockMe({ has_password: true });
    return HttpResponse.json({ ok: true });
  }),

  http.post(`${env.apiUrl}/api/v1/users/me/contact/verify-request`, async ({ request }) => {
    const body = (await request.json()) as ContactVerifyRequest;
    const contact = body.type === 'email' ? mockMe.user.email : mockMe.user.phone;
    if (contact == null) {
      return validationError(`The account has no ${body.type}`);
    }
    const verified =
      body.type === 'email' ? mockMe.user.email_verified : mockMe.user.phone_verified;
    if (verified) {
      return conflictError('Contact is already verified');
    }
    return HttpResponse.json({ contact, expires_in_seconds: 600 });
  }),

  http.post(`${env.apiUrl}/api/v1/users/me/contact/verify-confirm`, async ({ request }) => {
    const body = (await request.json()) as ContactVerifyConfirmRequest;
    if (body.code !== MOCK_CODE) {
      return validationError('Invalid verification code', 'invalid_verification_code');
    }
    if (body.type === 'email') {
      setMockMe({ email_verified: true, verification_deadline_at: null });
    } else {
      setMockMe({ phone_verified: true });
    }
    return HttpResponse.json(mockMe.user);
  }),

  http.post(`${env.apiUrl}/api/v1/users/me/contact/change-request`, async ({ request }) => {
    const body = (await request.json()) as ContactChangeRequest;
    const pattern = body.type === 'email' ? emailPattern : phonePattern;
    if (!pattern.test(body.new_contact)) {
      return validationError(`Invalid ${body.type} format`);
    }
    const verified =
      body.type === 'email' ? mockMe.user.email_verified : mockMe.user.phone_verified;
    if (!verified) {
      return conflictError('Unverified contact is edited via PATCH /users/me');
    }
    pendingContactChange = { type: body.type, value: body.new_contact };
    return HttpResponse.json({ contact: body.new_contact, expires_in_seconds: 600 });
  }),

  http.post(`${env.apiUrl}/api/v1/users/me/contact/change-confirm`, async ({ request }) => {
    const body = (await request.json()) as ContactChangeConfirmRequest;
    if (body.code !== MOCK_CODE || pendingContactChange?.type !== body.type) {
      return validationError('Invalid verification code', 'invalid_verification_code');
    }
    if (body.type === 'email') {
      setMockMe({
        email: pendingContactChange.value,
        email_verified: true,
        verification_deadline_at: null,
      });
    } else {
      setMockMe({ phone: pendingContactChange.value, phone_verified: true });
    }
    pendingContactChange = null;
    return HttpResponse.json(mockMe.user);
  }),

  http.post(`${env.apiUrl}/api/v1/users/me/login-method/request-code`, async ({ request }) => {
    await request.json();
    if (!mockMe.user.email || !mockMe.user.email_verified) {
      return validationError('A verified email is required to change the login method');
    }
    return HttpResponse.json({ contact: mockMe.user.email, expires_in_seconds: 600 });
  }),

  http.put(`${env.apiUrl}/api/v1/users/me/login-method`, async ({ request }) => {
    const body = (await request.json()) as SetLoginMethodRequest;
    if ((body.method === 'code' || body.method === 'two_factor') && !mockMe.user.email_verified) {
      return validationError('Confirm your email first', 'email_confirmation_required');
    }
    if ((body.method === 'password' || body.method === 'two_factor') && !mockMe.user.has_password) {
      return validationError('Set a password first', 'password_required');
    }
    if (body.code !== MOCK_CODE) {
      return validationError('Invalid verification code', 'invalid_verification_code');
    }
    setMockMe({ login_method: body.method });
    return HttpResponse.json(mockMe.user);
  }),

  http.post(`${env.apiUrl}/api/v1/users/me/delete-request`, async ({ request }) => {
    await request.json();
    const byPassword =
      mockMe.user.has_password &&
      (mockMe.user.login_method === 'password' || mockMe.user.login_method === 'two_factor');
    if (byPassword) {
      return HttpResponse.json({ confirmation: 'password', expires_in_seconds: null });
    }
    return HttpResponse.json({ confirmation: 'code', expires_in_seconds: 600 });
  }),

  http.post(`${env.apiUrl}/api/v1/users/me/delete-confirm`, async ({ request }) => {
    const body = (await request.json()) as DeleteAccountConfirmRequest;
    const byPassword =
      mockMe.user.has_password &&
      (mockMe.user.login_method === 'password' || mockMe.user.login_method === 'two_factor');
    if (byPassword) {
      if (body.password !== CURRENT_PASSWORD) {
        return HttpResponse.json(
          { code: 'unauthorized', message: 'Invalid password', details: null },
          { status: 401 },
        );
      }
    } else if (body.code !== MOCK_CODE) {
      return validationError('Invalid verification code', 'invalid_verification_code');
    }
    return HttpResponse.json({ ok: true });
  }),
];
