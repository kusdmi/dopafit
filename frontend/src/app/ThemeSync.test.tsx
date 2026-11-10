import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { ThemeSync } from './ThemeSync';
import { applyStatusBarTheme } from '@/shared/lib/platform/status-bar/status-bar';
import { setThemePreference } from '@/shared/lib/theme/useTheme';

vi.mock('@/shared/lib/platform/status-bar/status-bar', () => ({
  applyStatusBarTheme: vi.fn(async () => {}),
}));

function renderThemeSync() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeSync />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.clearAllMocks());

it('применяет тёмный статус-бар когда выбрана тёмная тема', () => {
  setThemePreference('dark');
  renderThemeSync();
  expect(applyStatusBarTheme).toHaveBeenCalledWith(true);
});

it('применяет светлый статус-бар когда выбрана светлая тема', () => {
  setThemePreference('light');
  renderThemeSync();
  expect(applyStatusBarTheme).toHaveBeenCalledWith(false);
});

it('перекрашивает статус-бар при системной смене темы (pref=system)', () => {
  const holder: { listener: (() => void) | null; matches: boolean } = {
    listener: null,
    matches: false,
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      get matches() {
        return holder.matches;
      },
      addEventListener: (_: string, l: () => void) => {
        holder.listener = l;
      },
      removeEventListener: () => {
        holder.listener = null;
      },
    })),
  );

  setThemePreference('system');
  renderThemeSync();
  // First paint: OS is light.
  expect(applyStatusBarTheme).toHaveBeenLastCalledWith(false);

  // OS flips to dark and fires the scheme change event.
  holder.matches = true;
  holder.listener?.();
  expect(applyStatusBarTheme).toHaveBeenLastCalledWith(true);

  vi.unstubAllGlobals();
});
