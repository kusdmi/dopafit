import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, it } from 'vitest';

import { useCreateExercise } from './use-create-exercise';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

it('creates an exercise and returns ownership own', async () => {
  const { result } = renderHook(() => useCreateExercise(), { wrapper });
  const created = await result.current.mutateAsync({
    name: 'Тестовое',
    category_id: '00000000-0000-4000-8000-000000000001',
    difficulty: 'beginner',
    description: '',
    steps: [],
    alt_names: [],
  });
  await waitFor(() => expect(created.ownership).toBe('own'));
});
