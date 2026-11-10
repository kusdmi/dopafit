import { env } from '@/shared/config/env';

export interface WorkoutReminder {
  id: number;
  at: Date;
  title: string;
  body: string;
}

/** Запланировать локальное напоминание о тренировке. Web — no-op. */
export async function scheduleWorkoutReminder(r: WorkoutReminder): Promise<void> {
  if (!env.isNative) return;
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  const perm = await LocalNotifications.requestPermissions();
  if (perm.display !== 'granted') return;
  await LocalNotifications.schedule({
    notifications: [{ id: r.id, title: r.title, body: r.body, schedule: { at: r.at } }],
  });
}

/** Отменить ранее запланированные напоминания. Web — no-op. */
export async function cancelWorkoutReminders(ids: number[]): Promise<void> {
  if (!env.isNative) return;
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  await LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) });
}

/** Стабильный положительный 31-битный int из uuid — LocalNotifications требует числовой id. */
export function uuidToInt(uuid: string): number {
  let hash = 0;
  for (let i = 0; i < uuid.length; i++) {
    hash = (hash << 5) - hash + uuid.charCodeAt(i);
    hash |= 0; // 32-bit
  }
  return Math.abs(hash) % 2_147_483_647;
}
