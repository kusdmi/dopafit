export interface CaptchaChallenge {
  id: number;
  siteKey: string;
}

let current: CaptchaChallenge | null = null;
let pending: { resolve: (token: string) => void; reject: (error: unknown) => void } | null = null;
let sequence = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

export function subscribeCaptcha(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const getCaptchaChallenge = () => current;

export function requestCaptcha(siteKey: string, signal: AbortSignal): Promise<string> {
  if (signal.aborted || pending || !listeners.size) {
    return Promise.reject({
      code: 'captcha_unavailable',
      message: 'Не удалось открыть проверку. Попробуйте ещё раз',
    });
  }
  return new Promise<string>((resolve, reject) => {
    const abort = () => cancelCaptcha();
    const cleanup = () => signal.removeEventListener('abort', abort);
    pending = {
      resolve: (token) => {
        cleanup();
        resolve(token);
      },
      reject: (error) => {
        cleanup();
        reject(error);
      },
    };
    current = { id: ++sequence, siteKey };
    signal.addEventListener('abort', abort, { once: true });
    emit();
  });
}

export function completeCaptcha(id: number, token: string): void {
  if (current?.id !== id || !token) return;
  const completion = pending;
  pending = null;
  current = null;
  emit();
  completion?.resolve(token);
}

export function cancelCaptcha(id?: number): void {
  if (id !== undefined && current?.id !== id) return;
  const completion = pending;
  pending = null;
  current = null;
  emit();
  completion?.reject({
    code: 'captcha_cancelled',
    message: 'Проверка отменена. Попробуйте ещё раз',
  });
}
