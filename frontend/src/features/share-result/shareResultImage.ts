import { env } from '@/shared/config/env';

import { CARD_WIDTH, CARD_HEIGHT } from './ResultCard';

const FILE_NAME = 'dopafit-workout.png';

async function rasterize(node: HTMLElement): Promise<Blob> {
  const { toBlob } = await import('html-to-image');
  const blob = await toBlob(node, { width: CARD_WIDTH, height: CARD_HEIGHT, pixelRatio: 1, cacheBust: true });
  if (!blob) throw new Error('Failed to render result card');
  return blob;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function downloadBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = FILE_NAME;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function shareResultImage(node: HTMLElement, title: string): Promise<'shared' | 'downloaded'> {
  const blob = await rasterize(node);
  if (env.isNative) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const data = await blobToBase64(blob);
    const written = await Filesystem.writeFile({ path: FILE_NAME, data, directory: Directory.Cache });
    await Share.share({ title, files: [written.uri], dialogTitle: title });
    return 'shared';
  }
  const file = new File([blob], FILE_NAME, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
  if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    await nav.share({ files: [file], title });
    return 'shared';
  }
  downloadBlob(blob);
  return 'downloaded';
}
