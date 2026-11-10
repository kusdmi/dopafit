import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { api } from '@/shared/api/client';

import { updateMeasurementMutationFn, useUpdateMeasurement } from './use-update-measurement';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useUpdateMeasurement', () => {
  it('PUTs the target measurement and returns the updated record', async () => {
    const { result } = renderHook(() => useUpdateMeasurement(), { wrapper });
    result.current.mutate({
      measurementId: 'm1',
      body: { id: 'm1', date: '2026-06-13', weight: 79, custom_values: [] },
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.id).toBe('m1');
    expect(result.current.data?.weight).toBe(79);
  });

  it('standalone mutationFn calls PUT with the id in the path and the body', async () => {
    const putSpy = vi.spyOn(api, 'PUT').mockResolvedValue({
      data: { id: 'm1', date: '2026-06-13', custom_values: [], photos: [] },
      error: undefined,
    } as never);

    await updateMeasurementMutationFn({
      measurementId: 'm1',
      body: { id: 'm1', date: '2026-06-13', custom_values: [] },
    });

    expect(putSpy).toHaveBeenCalledWith('/api/v1/measurements/{measurement_id}', {
      params: { path: { measurement_id: 'm1' } },
      body: { id: 'm1', date: '2026-06-13', custom_values: [] },
    });
  });
});

it('rolls back an optimistic edit rejected by the server without retrying validation', async () => {
  vi.restoreAllMocks();
  const qc = new QueryClient();
  const previous = { items: [{ id: 'm1', date: '2026-06-13', weight: 80 }], total: 1 };
  qc.setQueryData(['measurements', 'list'], previous);
  const put = vi.spyOn(api, 'PUT').mockResolvedValue({
    error: { code: 'validation_error', message: 'Invalid', details: [] },
  } as never);
  const localWrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useUpdateMeasurement(), { wrapper: localWrapper });
  await expect(
    result.current.mutateAsync({
      measurementId: 'm1',
      body: { date: '2026-06-13', weight: -1, custom_values: [] },
    }),
  ).rejects.toMatchObject({ code: 'validation_error' });
  expect(qc.getQueryData(['measurements', 'list'])).toEqual(previous);
  expect(put).toHaveBeenCalledTimes(1);
  put.mockRestore();
});
