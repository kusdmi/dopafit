import { platformStorage } from '@/shared/lib/platform/storage/settings';

const KEY = 'dopafit.recent_exercises';
const MAX = 10;

function read(): string[] {
  const raw = platformStorage.get(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

/** LRU of recently used exercise ids, newest first, capped at MAX. */
export const recentExercises = {
  get(): string[] {
    return read();
  },
  push(id: string): void {
    const next = [id, ...read().filter((x) => x !== id)].slice(0, MAX);
    platformStorage.set(KEY, JSON.stringify(next));
  },
};
