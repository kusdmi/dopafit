import { afterEach, expect, it, vi } from 'vitest';

vi.mock('html-to-image', () => ({
  toBlob: vi.fn(async () => new Blob(['x'], { type: 'image/png' })),
}));
vi.mock('@/shared/config/env', () => ({ env: { isNative: false } }));

import { shareResultImage } from './shareResultImage';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('uses navigator.share with a file when available on web', async () => {
  const share = vi.fn(async (_data: ShareData) => {});
  vi.stubGlobal('navigator', { canShare: vi.fn(() => true), share } as unknown as Navigator);
  const node = document.createElement('div');
  await shareResultImage(node, 'Тренировка #7');
  expect(share).toHaveBeenCalledTimes(1);
  const arg = share.mock.calls[0][0] as { files?: File[] };
  expect(arg.files?.[0]).toBeInstanceOf(File);
});

it('falls back to download when web share is unavailable', async () => {
  vi.stubGlobal('navigator', {} as unknown as Navigator);
  const click = vi.fn();
  const anchor = document.createElement('a');
  anchor.click = click;
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) =>
    tag === 'a' ? anchor : ({} as HTMLElement),
  );
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:x'),
    revokeObjectURL: vi.fn(),
  } as unknown as typeof URL);
  const node = document.createElement('div');
  await shareResultImage(node, 'Тренировка #7');
  expect(click).toHaveBeenCalledTimes(1);
});
