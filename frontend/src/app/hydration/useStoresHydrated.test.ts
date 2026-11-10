import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useStoresHydrated } from './useStoresHydrated';

describe('useStoresHydrated', () => {
  it('eventually reports hydrated true', async () => {
    const { result, rerender } = renderHook(() => useStoresHydrated());
    // zustand persist с async-storage гидрируется в микротасках; ждём.
    await new Promise((r) => setTimeout(r, 0));
    rerender();
    expect(result.current).toBe(true);
  });
});
