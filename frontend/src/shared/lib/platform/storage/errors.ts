let failure: string | null = null;
const listeners = new Set<() => void>();

export function reportStorageError(): void {
  failure =
    'Не удалось сохранить или прочитать данные на устройстве. Не закрывайте приложение и повторите сохранение.';
  listeners.forEach((listener) => listener());
}
export function clearStorageError(): void {
  failure = null;
  listeners.forEach((listener) => listener());
}
export const getStorageError = () => failure;
export const subscribeStorageError = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export async function storageOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    reportStorageError();
    throw error;
  }
}
