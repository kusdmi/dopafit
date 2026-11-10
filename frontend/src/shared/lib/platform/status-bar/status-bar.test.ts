import { afterEach, describe, expect, it, vi } from 'vitest';

const isNativeMock = vi.fn(() => true);
vi.mock('@/shared/config/env', () => ({ env: { get isNative() { return isNativeMock(); } } }));

describe('applyStatusBarTheme', () => {
  afterEach(() => vi.clearAllMocks());

  it('native dark → setStyle(Dark)', async () => {
    isNativeMock.mockReturnValue(true);
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    const { applyStatusBarTheme } = await import('./status-bar');
    await applyStatusBarTheme(true);
    expect(StatusBar.setStyle).toHaveBeenCalledWith({ style: Style.Dark });
  });

  it('web → no-op (плагин не вызывается)', async () => {
    isNativeMock.mockReturnValue(false);
    const { StatusBar } = await import('@capacitor/status-bar');
    const { applyStatusBarTheme } = await import('./status-bar');
    await applyStatusBarTheme(true);
    expect(StatusBar.setStyle).not.toHaveBeenCalled();
  });
});
