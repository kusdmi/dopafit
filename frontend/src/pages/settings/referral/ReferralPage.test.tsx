import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { useSessionStore } from '@/entities/session/model/store';
import { env } from '@/shared/config/env';
import { paths } from '@/shared/config/paths';
import { server } from '@/app/mocks/server';
import { mockAuthResponse } from '@/shared/test/factories';

import { AppRoutes } from '@/app/router';

async function signIn() {
  await useSessionStore
    .getState()
    .setSession(mockAuthResponse({ email: 'client@dopafit.dev', phone: '+79990000001' }));
}

function renderRoute(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  window.history.pushState({}, '', path);
  return render(
    <QueryClientProvider client={queryClient}>
      <AppRoutes />
    </QueryClientProvider>,
  );
}

const REFERRAL = {
  code: 'DOPATEST',
  link: 'https://dopafit.app/invite/DOPATEST',
  invited_count: 3,
  active_count: 2,
  earned_days: 14,
};

describe('referral program screen', () => {
  beforeEach(async () => {
    await useSessionStore.getState().clearSession();
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
  });

  it('shows the referral code, link, stats and a copy action', async () => {
    server.use(
      http.get(`${env.apiUrl}/api/v1/referrals/me`, () => HttpResponse.json(REFERRAL)),
    );

    await signIn();
    renderRoute(paths.settingsReferral);

    // Referral code is rendered prominently.
    expect(await screen.findByText('DOPATEST')).toBeInTheDocument();

    // Referral link (at least a fragment) is visible.
    expect(screen.getByText(/dopafit\.app\/invite\/DOPATEST/)).toBeInTheDocument();

    // Stats: invited (3), active (2), earned days (14).
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('14')).toBeInTheDocument();

    // A copy action is present.
    expect(screen.getByRole('button', { name: /Скопировать код/ })).toBeInTheDocument();
  });
});
