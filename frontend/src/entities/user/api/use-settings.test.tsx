import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import { server } from '@/app/mocks/server';
import { useSessionStore } from '@/entities/session/model/store';
import { env } from '@/shared/config/env';
import { mockAuthResponse } from '@/shared/test/factories';

import { settingsQueryKey, useUpdateSettings } from './use-settings';

function wrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useUpdateSettings', () => {
  beforeEach(async () => {
    await useSessionStore.getState().setSession(mockAuthResponse());
  });

  // Без оптимистичного применения выбор в пикере повисал до конца круга к
  // серверу: экран ещё показывал старое значение, потом ответ приходил и всё
  // разом перерисовывалось — заметный рывок на каждом выборе.
  it('applies the change to the cache before the request settles', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const userId = useSessionStore.getState().user?.id ?? 'anonymous';
    const key = settingsQueryKey(userId);
    queryClient.setQueryData(key, {
      analytics_config: { home_measurement_parameter: 'weight' },
      notifications_enabled: true,
      theme: 'dark',
    });

    const { result } = renderHook(() => useUpdateSettings(), { wrapper: wrapper(queryClient) });
    result.current.mutate({ analytics_config: { home_measurement_parameter: 'waist' } });

    // Кэш обновлён, не дожидаясь isSuccess.
    await waitFor(() =>
      expect(
        (queryClient.getQueryData(key) as { analytics_config: Record<string, unknown> })
          .analytics_config.home_measurement_parameter,
      ).toBe('waist'),
    );
  });

  // Оптимистичное применение без отката оставило бы на экране значение,
  // которого нет на сервере.
  it('rolls the cache back when the request fails', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const userId = useSessionStore.getState().user?.id ?? 'anonymous';
    const key = settingsQueryKey(userId);
    const before = {
      analytics_config: { home_measurement_parameter: 'weight' },
      notifications_enabled: true,
      theme: 'dark',
    };
    queryClient.setQueryData(key, before);

    // Мок настроек всегда отвечает успехом, поэтому ошибку задаём явно:
    // проверяем именно откат, а не поведение сервера.
    server.use(
      http.put(`${env.apiUrl}/api/v1/users/me/settings`, () =>
        HttpResponse.json({ detail: 'nope' }, { status: 500 }),
      ),
    );

    const { result } = renderHook(() => useUpdateSettings(), { wrapper: wrapper(queryClient) });
    result.current.mutate({ analytics_config: { home_measurement_parameter: 'waist' } });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryData(key)).toEqual(before);
  });

  // Поля запроса допускают null там, где ответ его не допускает. Слепок не
  // должен протащить null в тип ответа.
  it('never writes a null over a non-nullable field', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const userId = useSessionStore.getState().user?.id ?? 'anonymous';
    const key = settingsQueryKey(userId);
    queryClient.setQueryData(key, {
      analytics_config: null,
      notifications_enabled: true,
      theme: 'dark',
    });

    const { result } = renderHook(() => useUpdateSettings(), { wrapper: wrapper(queryClient) });
    result.current.mutate({ theme: null, notifications_enabled: null });

    await waitFor(() => expect(result.current.isSuccess || result.current.isError).toBe(true));
    const after = queryClient.getQueryData(key) as {
      theme: string;
      notifications_enabled: boolean;
    };
    expect(after.theme).not.toBeNull();
    expect(after.notifications_enabled).not.toBeNull();
  });
});
