import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { useSetFavorite } from './use-set-favorite';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient();
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useSetFavorite', () => {
  it('marks an exercise as favorite', async () => {
    const { result } = renderHook(() => useSetFavorite(), { wrapper });
    result.current.mutate({ id: 'ex-1', isFavorite: true });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.id).toBe('ex-1');
    expect(result.current.data?.is_favorite).toBe(true);
  });
});
