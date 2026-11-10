import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useCancelEvent, useCreateEvent, useUpdateEvent } from './use-calendar-mutations';

const scheduleWorkoutReminder = vi.fn(async (..._args: unknown[]) => {});
const cancelWorkoutReminders = vi.fn(async (..._args: unknown[]) => {});
vi.mock('@/shared/lib/platform/local-notifications/reminders', () => ({
  scheduleWorkoutReminder: (...args: unknown[]) => scheduleWorkoutReminder(...args),
  cancelWorkoutReminders: (...args: unknown[]) => cancelWorkoutReminders(...args),
  // Real-ish stable hash so the test sees a number id.
  uuidToInt: (uuid: string) => uuid.length,
}));

const settings = { data: undefined as { workout_reminders: boolean } | undefined };
vi.mock('@/entities/notification/api/use-notification-settings', () => ({
  useNotificationSettings: () => settings,
}));

const post = vi.fn(async (..._args: unknown[]) => ({}) as unknown);
const put = vi.fn(async (..._args: unknown[]) => ({}) as unknown);
const del = vi.fn(async (..._args: unknown[]) => ({}) as unknown);
vi.mock('@/shared/api/client', () => ({
  api: {
    POST: (...args: unknown[]) => post(...args),
    PUT: (...args: unknown[]) => put(...args),
    DELETE: (...args: unknown[]) => del(...args),
  },
  toApiError: (e: unknown) => e,
}));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const futureEvent = { id: 'evt-uuid', date: '2099-01-01', time: '09:00:00' };

describe('useCreateEvent reminder scheduling', () => {
  afterEach(() => {
    vi.clearAllMocks();
    settings.data = undefined;
  });

  it('schedules a reminder when workout_reminders is on and event is in the future', async () => {
    settings.data = { workout_reminders: true };
    post.mockResolvedValue({ data: futureEvent, error: undefined });

    const { result } = renderHook(() => useCreateEvent(), { wrapper });
    result.current.mutate({} as never);

    await waitFor(() => expect(scheduleWorkoutReminder).toHaveBeenCalledTimes(1));
    expect(scheduleWorkoutReminder).toHaveBeenCalledWith(
      expect.objectContaining({ id: expect.any(Number), title: 'Тренировка' }),
    );
  });

  it('does NOT schedule when workout_reminders is off', async () => {
    settings.data = { workout_reminders: false };
    post.mockResolvedValue({ data: futureEvent, error: undefined });

    const { result } = renderHook(() => useCreateEvent(), { wrapper });
    result.current.mutate({} as never);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(scheduleWorkoutReminder).not.toHaveBeenCalled();
  });

  it('does NOT schedule for a past event even with the setting on', async () => {
    settings.data = { workout_reminders: true };
    post.mockResolvedValue({
      data: { id: 'evt-uuid', date: '2000-01-01', time: '09:00:00' },
      error: undefined,
    });

    const { result } = renderHook(() => useCreateEvent(), { wrapper });
    result.current.mutate({} as never);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(scheduleWorkoutReminder).not.toHaveBeenCalled();
  });
});

describe('useCancelEvent reminder cancellation', () => {
  afterEach(() => {
    vi.clearAllMocks();
    settings.data = undefined;
  });

  it('cancels the pending reminder with the deterministic id derived from the event id', async () => {
    del.mockResolvedValue({ data: undefined, error: undefined });

    const { result } = renderHook(() => useCancelEvent(), { wrapper });
    result.current.mutate('evt-uuid');

    await waitFor(() => expect(cancelWorkoutReminders).toHaveBeenCalledTimes(1));
    // uuidToInt is mocked to uuid.length -> 'evt-uuid'.length === 8
    expect(cancelWorkoutReminders).toHaveBeenCalledWith([8]);
  });
});

describe('useUpdateEvent reminder rescheduling', () => {
  afterEach(() => {
    vi.clearAllMocks();
    settings.data = undefined;
  });

  it('cancels then reschedules the reminder at the new time when reminders are on', async () => {
    settings.data = { workout_reminders: true };
    put.mockResolvedValue({ data: futureEvent, error: undefined });

    const { result } = renderHook(() => useUpdateEvent(), { wrapper });
    result.current.mutate({ id: 'evt-uuid', body: {} } as never);

    await waitFor(() => expect(scheduleWorkoutReminder).toHaveBeenCalledTimes(1));
    expect(cancelWorkoutReminders).toHaveBeenCalledWith([8]);
    expect(scheduleWorkoutReminder).toHaveBeenCalledWith(
      expect.objectContaining({ id: 8, title: 'Тренировка' }),
    );
  });

  it('cancels but does NOT reschedule when reminders are off', async () => {
    settings.data = { workout_reminders: false };
    put.mockResolvedValue({ data: futureEvent, error: undefined });

    const { result } = renderHook(() => useUpdateEvent(), { wrapper });
    result.current.mutate({ id: 'evt-uuid', body: {} } as never);

    await waitFor(() => expect(cancelWorkoutReminders).toHaveBeenCalledTimes(1));
    expect(scheduleWorkoutReminder).not.toHaveBeenCalled();
  });
});
