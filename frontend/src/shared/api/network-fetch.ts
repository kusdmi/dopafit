import { apiNetworkEvents } from './events';

export async function fetchApi(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  try {
    const response =
      init === undefined ? await globalThis.fetch(input) : await globalThis.fetch(input, init);
    apiNetworkEvents.emit('reachable');
    return response;
  } catch (error) {
    const aborted =
      signal?.aborted ||
      (typeof error === 'object' &&
        error !== null &&
        'name' in error &&
        error.name === 'AbortError');
    if (!aborted) {
      apiNetworkEvents.emit();
    }
    throw error;
  }
}
