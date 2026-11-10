import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useSessionStore } from '@/entities/session/model/store';
import { retryAfterSeconds } from '@/shared/api/client';
import { server } from '@/app/mocks/server';
import { env } from '@/shared/config/env';

import { useRequestLoginCode } from './use-request-login-code';
import { useVerifyLoginCode } from './use-verify-login-code';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('login code hooks', () => {
  beforeEach(async () => {
    await useSessionStore.getState().clearSession();
  });

  it('verify-code signs a code user in', async () => {
    const { result } = renderHook(() => useVerifyLoginCode(), { wrapper });
    result.current.mutate({ contact: 'code@dopafit.dev', code: '000000' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(useSessionStore.getState().isAuthenticated).toBe(true);
    expect(useSessionStore.getState().user?.login_method).toBe('code');
  });

  it('verify-code returns a 2fa challenge without signing in', async () => {
    const { result } = renderHook(() => useVerifyLoginCode(), { wrapper });
    result.current.mutate({ contact: 'twofactor@dopafit.dev', code: '000000' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.two_factor_required).toBe(true);
    expect(result.current.data?.challenge_token).toBeTruthy();
    expect(useSessionStore.getState().isAuthenticated).toBe(false);
  });

  it('retryAfterSeconds extracts the 429 cooldown and ignores other errors', async () => {
    server.use(
      http.post(`${env.apiUrl}/api/v1/auth/login/request-code`, () =>
        HttpResponse.json(
          {
            code: 'rate_limited',
            message: 'Too many requests',
            details: { retry_after_seconds: 42 },
          },
          { status: 429, headers: { 'Retry-After': '42' } },
        ),
      ),
    );
    const { result } = renderHook(() => useRequestLoginCode(), { wrapper });
    result.current.mutate({ contact: 'code@dopafit.dev' });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(retryAfterSeconds(result.current.error)).toBe(42);
    expect(retryAfterSeconds(new Error('boom'))).toBeNull();
  });
});
