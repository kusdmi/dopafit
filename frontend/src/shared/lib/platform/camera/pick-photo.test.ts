import { afterEach, describe, expect, it, vi } from 'vitest';

const isNativeMock = vi.fn(() => false);
vi.mock('@/shared/config/env', () => ({
  env: {
    get isNative() {
      return isNativeMock();
    },
  },
}));

describe('pickPhoto', () => {
  afterEach(() => vi.clearAllMocks());

  it('native камера: action-sheet (камера) → takePhoto → fetch(webPath) → Blob', async () => {
    isNativeMock.mockReturnValue(true);
    const { ActionSheet } = await import('@capacitor/action-sheet');
    const { Camera } = await import('@capacitor/camera');
    (ActionSheet.showActions as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      index: 0,
      canceled: false,
    });
    const blob = new Blob(['x'], { type: 'image/jpeg' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ blob: async () => blob }) as unknown as Response),
    );
    const { pickPhoto } = await import('./pick-photo');
    const result = await pickPhoto();
    expect(result).toBe(blob);
    expect(Camera.takePhoto).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('native галерея: action-sheet (галерея) → chooseFromGallery → fetch(webPath) → Blob', async () => {
    isNativeMock.mockReturnValue(true);
    const { ActionSheet } = await import('@capacitor/action-sheet');
    const { Camera } = await import('@capacitor/camera');
    (ActionSheet.showActions as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      index: 1,
      canceled: false,
    });
    (Camera.chooseFromGallery as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      results: [{ webPath: 'blob:mock-gallery' }],
    });
    const blob = new Blob(['y'], { type: 'image/jpeg' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ blob: async () => blob }) as unknown as Response),
    );
    const { pickPhoto } = await import('./pick-photo');
    const result = await pickPhoto();
    expect(result).toBe(blob);
    expect(Camera.chooseFromGallery).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('native: возвращает null если пользователь отменил (индекс отмены)', async () => {
    isNativeMock.mockReturnValue(true);
    const { ActionSheet } = await import('@capacitor/action-sheet');
    const { Camera } = await import('@capacitor/camera');
    (ActionSheet.showActions as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      index: 2,
      canceled: true,
    });
    const { pickPhoto } = await import('./pick-photo');
    expect(await pickPhoto()).toBeNull();
    expect(Camera.takePhoto).not.toHaveBeenCalled();
    expect(Camera.chooseFromGallery).not.toHaveBeenCalled();
  });

  it('web: открывает file input и возвращает выбранный файл как Blob', async () => {
    isNativeMock.mockReturnValue(false);
    const file = new File(['x'], 'p.jpg', { type: 'image/jpeg' });
    const clickSpy = vi
      .spyOn(HTMLInputElement.prototype, 'click')
      .mockImplementation(function (this: HTMLInputElement) {
        Object.defineProperty(this, 'files', { value: [file], configurable: true });
        this.dispatchEvent(new Event('change'));
      });
    const { pickPhoto } = await import('./pick-photo');
    const result = await pickPhoto();
    expect(result).toBe(file);
    clickSpy.mockRestore();
  });
});
