import { afterEach, describe, expect, it, vi } from 'vitest';

const isNativeMock = vi.fn(() => true);
vi.mock('@/shared/config/env', () => ({ env: { get isNative() { return isNativeMock(); } } }));

describe('initKeyboard', () => {
  afterEach(() => vi.clearAllMocks());

  it('native → setResizeMode(native)', async () => {
    isNativeMock.mockReturnValue(true);
    const { Keyboard, KeyboardResize } = await import('@capacitor/keyboard');
    const { initKeyboard } = await import('./keyboard');
    await initKeyboard();
    // None resize: webview не меняет размер, клавиатура поверх контента, scroll-assist
    // WebView меняет размер, обычный скролл держит активное поле видимым (см. keyboard.ts).
    expect(Keyboard.setResizeMode).toHaveBeenCalledWith({ mode: KeyboardResize.Native });
    // Панель «‹ › Done» для перехода между полями с клавиатуры (iPhone).
    expect(Keyboard.setAccessoryBarVisible).toHaveBeenCalledWith({ isVisible: true });
  });

  it('web → no-op', async () => {
    isNativeMock.mockReturnValue(false);
    const { Keyboard } = await import('@capacitor/keyboard');
    const { initKeyboard } = await import('./keyboard');
    await initKeyboard();
    expect(Keyboard.setResizeMode).not.toHaveBeenCalled();
  });
});
