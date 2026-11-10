import { describe, expect, it } from 'vitest';

import { env } from '@/shared/config/env';

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${env.apiUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('session mocks follow the auth redesign contract', () => {
  it('register returns 201 with contact, ttl and a registration token', async () => {
    const response = await post('/api/v1/auth/register', {
      full_name: 'Test User',
      email: 'new@example.com',
      role: 'client',
      personal_data_consent: true,
    });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.contact).toBe('new@example.com');
    expect(body.expires_in_seconds).toBeGreaterThan(0);
    expect(body.registration_token).toMatch(/^mock-registration-/);
  });

  it('register/verify logs the user in with email_verified and no deadline', async () => {
    await post('/api/v1/auth/register', {
      full_name: 'Test User',
      email: 'new@example.com',
      role: 'client',
      personal_data_consent: true,
    });
    const response = await post('/api/v1/auth/register/verify', {
      email: 'new@example.com',
      code: '000000',
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.user.email_verified).toBe(true);
    expect(body.user.verification_deadline_at).toBeNull();
    expect(body.user.login_method).toBe('code');
    expect(body.tokens.access_token).toBeTruthy();
  });

  it('set-password completes the skip branch with the registration token', async () => {
    const register = await post('/api/v1/auth/register', {
      full_name: 'Test User',
      email: 'skip@example.com',
      role: 'client',
      personal_data_consent: true,
    });
    const { registration_token } = await register.json();
    const response = await post('/api/v1/auth/set-password', {
      registration_token,
      password: 'Password1',
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.user.has_password).toBe(true);
    expect(body.user.login_method).toBe('password');
    expect(body.user.email_verified).toBe(false);
    expect(body.user.verification_deadline_at).not.toBeNull();
  });

  it('login/request-code responds identically for known and unknown emails', async () => {
    const known = await post('/api/v1/auth/login/request-code', {
      contact: 'code@dopafit.dev',
    });
    const unknown = await post('/api/v1/auth/login/request-code', {
      contact: 'ghost@nowhere.dev',
    });
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(await known.json()).toEqual(await unknown.json());
  });

  it('login/verify-code returns auth for a code user and a challenge for 2fa', async () => {
    const code = await post('/api/v1/auth/login/verify-code', {
      contact: 'code@dopafit.dev',
      code: '000000',
    });
    expect(code.status).toBe(200);
    const codeBody = await code.json();
    expect(codeBody.two_factor_required).toBe(false);
    expect(codeBody.auth.user.email).toBe('code@dopafit.dev');

    const twoFactor = await post('/api/v1/auth/login/verify-code', {
      contact: 'twofactor@dopafit.dev',
      code: '000000',
    });
    const twoFactorBody = await twoFactor.json();
    expect(twoFactorBody.two_factor_required).toBe(true);
    expect(twoFactorBody.challenge_token).toMatch(/^mock-challenge-/);
    expect(twoFactorBody.auth).toBeNull();
  });

  it('password login honours login_method and the 2fa challenge', async () => {
    // code-method user: password login is off even with a valid password
    const codeUser = await post('/api/v1/auth/login', {
      contact: 'code@dopafit.dev',
      password: 'Dopafit1Demo',
    });
    expect(codeUser.status).toBe(401);

    // 2fa user: password without a challenge is rejected
    const noChallenge = await post('/api/v1/auth/login', {
      contact: 'twofactor@dopafit.dev',
      password: 'Dopafit1Demo',
    });
    expect(noChallenge.status).toBe(401);

    const withChallenge = await post('/api/v1/auth/login', {
      contact: 'twofactor@dopafit.dev',
      password: 'Dopafit1Demo',
      challenge_token: 'mock-challenge-twofactor@dopafit.dev',
    });
    expect(withChallenge.status).toBe(200);
  });

  it('password-method user never gets a login code (service letter case)', async () => {
    const response = await post('/api/v1/auth/login/verify-code', {
      contact: 'client@dopafit.dev',
      code: '000000',
    });
    expect(response.status).toBe(404);
  });
});
