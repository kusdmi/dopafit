import type { components } from '@/shared/api/schema';

type UserOut = components['schemas']['UserOut'];
type AuthResponse = components['schemas']['AuthResponse'];

/** Canonical UserOut for tests: a verified passwordless code-login client. */
export function mockUserOut(overrides: Partial<UserOut> = {}): UserOut {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'client@dopafit.dev',
    phone: null,
    role: 'client',
    referral_code: 'DOPA0001',
    email_verified: true,
    phone_verified: false,
    has_password: false,
    login_method: 'code',
    verification_deadline_at: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

export function mockAuthResponse(overrides: Partial<UserOut> = {}): AuthResponse {
  const user = mockUserOut(overrides);
  return {
    user,
    tokens: {
      access_token: `mock-access-${user.id}`,
      refresh_token: `mock-refresh-${user.id}`,
      token_type: 'bearer',
    },
  };
}
