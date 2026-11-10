import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, it } from 'vitest';

import { useSessionStore } from '@/entities/session/model/store';

import { useAnalyticsConfig } from './useAnalyticsConfig';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

it('returns the migrated default config when settings.analytics_config is null', async () => {
  useSessionStore.setState({ user: { id: 'u1', role: 'client' } as never, isAuthenticated: true });
  const { result } = renderHook(() => useAnalyticsConfig(), { wrapper });
  await waitFor(() => expect(result.current.config.charts.length).toBe(2));
  expect(result.current.config.default_period).toBe('90d');
});
