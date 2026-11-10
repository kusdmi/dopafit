import { afterEach, describe, expect, it, vi } from 'vitest';

const isNativeMock = vi.fn(() => true);
vi.mock('@/shared/config/env', () => ({
  env: {
    get isNative() {
      return isNativeMock();
    },
  },
}));

describe('scheduleWorkoutReminder', () => {
  afterEach(() => vi.clearAllMocks());

  it('native: запрашивает разрешение и планирует уведомление', async () => {
    isNativeMock.mockReturnValue(true);
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const { scheduleWorkoutReminder } = await import('./reminders');
    const at = new Date('2026-07-01T09:00:00Z');
    await scheduleWorkoutReminder({ id: 42, at, title: 'Тренировка', body: 'Пора' });
    expect(LocalNotifications.requestPermissions).toHaveBeenCalled();
    expect(LocalNotifications.schedule).toHaveBeenCalledWith({
      notifications: [
        expect.objectContaining({ id: 42, title: 'Тренировка', body: 'Пора', schedule: { at } }),
      ],
    });
  });

  it('web: no-op', async () => {
    isNativeMock.mockReturnValue(false);
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const { scheduleWorkoutReminder } = await import('./reminders');
    await scheduleWorkoutReminder({ id: 1, at: new Date(), title: 't', body: 'b' });
    expect(LocalNotifications.schedule).not.toHaveBeenCalled();
  });
});

describe('uuidToInt', () => {
  it('детерминирован: один и тот же uuid → один и тот же int', async () => {
    const { uuidToInt } = await import('./reminders');
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    expect(uuidToInt(uuid)).toBe(uuidToInt(uuid));
  });

  it('разные uuid → разные int', async () => {
    const { uuidToInt } = await import('./reminders');
    const a = uuidToInt('550e8400-e29b-41d4-a716-446655440000');
    const b = uuidToInt('6ba7b810-9dad-11d1-80b4-00c04fd430c8');
    expect(a).not.toBe(b);
  });

  it('результат — неотрицательное целое в пределах 31 бита', async () => {
    const { uuidToInt } = await import('./reminders');
    const n = uuidToInt('6ba7b811-9dad-11d1-80b4-00c04fd430c8');
    expect(Number.isInteger(n)).toBe(true);
    expect(n).toBeGreaterThanOrEqual(0);
    expect(n).toBeLessThan(2_147_483_647);
  });
});
