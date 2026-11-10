import { ensureRefreshed } from '@/shared/api/refresh';
import { tokenStorage } from '@/shared/api/tokens';
import { env } from '@/shared/config/env';

/** A photo URL is an API path, never a storage origin that could receive a bearer token. */
function photoEndpoint(path: string): string {
  const base = new URL(env.apiUrl, globalThis.location?.origin ?? 'http://localhost');
  const target = new URL(path, base);
  if (
    !path.startsWith('/api/v1/measurements/') ||
    target.origin !== base.origin ||
    !/^\/api\/v1\/measurements\/[^/]+\/photos\/(front|back|left|right)\/content$/.test(
      target.pathname,
    ) ||
    target.search ||
    target.hash
  ) {
    throw new Error('Invalid private photo URL');
  }
  return target.href;
}

export async function fetchPrivatePhoto(path: string, signal: AbortSignal): Promise<Blob> {
  const url = photoEndpoint(path);
  const generation = tokenStorage.getGeneration();
  const send = async () => {
    const token = await tokenStorage.getAccess();
    return globalThis.fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      cache: 'no-store',
      signal,
    });
  };
  let response = await send();
  if (response.status === 401 && (await ensureRefreshed()) === 'refreshed') response = await send();
  if (!response.ok || tokenStorage.getGeneration() !== generation)
    throw new Error(`Private photo request failed: ${response.status}`);
  const contentType = response.headers.get('Content-Type');
  if (!contentType?.startsWith('image/')) throw new Error('Private photo response is not an image');
  return response.blob();
}
