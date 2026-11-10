import { afterEach, expect, it, vi } from 'vitest';

vi.mock('html-to-image', () => ({
  toBlob: vi.fn(async () => {
    const blob = new Blob(['x'], { type: 'image/png' });
    // jsdom's Blob lacks arrayBuffer(); the native path needs it for base64.
    if (typeof blob.arrayBuffer !== 'function') {
      Object.defineProperty(blob, 'arrayBuffer', {
        value: async () => new Uint8Array([120]).buffer,
      });
    }
    return blob;
  }),
}));
vi.mock('@/shared/config/env', () => ({ env: { isNative: true } }));

const writeFile = vi.fn(async (_opts: { data: string; directory: string; path: string }) => ({
  uri: 'file:///cache/dopafit-workout.png',
}));
const share = vi.fn(async (_opts: { files?: string[]; title?: string; dialogTitle?: string }) => {});
vi.mock('@capacitor/filesystem', () => ({
  Filesystem: { writeFile },
  Directory: { Cache: 'CACHE' },
}));
vi.mock('@capacitor/share', () => ({
  Share: { share },
}));

import { shareResultImage } from './shareResultImage';

afterEach(() => {
  vi.clearAllMocks();
});

it('writes the PNG to cache and shares the file on native', async () => {
  const node = document.createElement('div');
  const result = await shareResultImage(node, 'Тренировка #7');

  expect(result).toBe('shared');
  // writeFile called with base64 data (no data: prefix) into the cache dir
  expect(writeFile).toHaveBeenCalledTimes(1);
  const wf = writeFile.mock.calls[0][0];
  expect(typeof wf.data).toBe('string');
  expect(wf.data.startsWith('data:')).toBe(false);
  expect(wf.directory).toBe('CACHE');
  // Share gets the uri returned by writeFile
  expect(share).toHaveBeenCalledTimes(1);
  const sh = share.mock.calls[0][0];
  expect(sh.files).toEqual(['file:///cache/dopafit-workout.png']);
  expect(sh.title).toBe('Тренировка #7');
});
