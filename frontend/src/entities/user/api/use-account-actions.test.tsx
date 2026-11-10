import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSessionStore } from '@/entities/session/model/store';
import { mockAuthResponse } from '@/shared/test/factories';

import { useChangePassword } from './use-account-actions';

function wrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useChangePassword', () => {
  beforeEach(async () => {
    await useSessionStore.getState().setSession(mockAuthResponse());
  });

  it('инвалидирует кэш me после успешной смены пароля', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const userId = useSessionStore.getState().user?.id ?? 'anonymous';

    const { result } = renderHook(() => useChangePassword(), {
      wrapper: wrapper(queryClient),
    });

    result.current.mutate({ current_password: 'Dopafit1Demo', new_password: 'Dopafit1New' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Ответ change-password = OkResponse, поэтому кэш нужно инвалидировать по ключу me.
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['users', userId, 'me'] });
  });
});
