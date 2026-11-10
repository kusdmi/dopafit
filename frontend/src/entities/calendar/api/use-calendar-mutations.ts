import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useNotificationSettings } from '@/entities/notification/@x/calendar';
import { api, toApiError } from '@/shared/api/client';
import type { components } from '@/shared/api/schema';
import {
  cancelWorkoutReminders,
  scheduleWorkoutReminder,
  uuidToInt,
} from '@/shared/lib/platform/local-notifications/reminders';

type EventCreateRequest = components['schemas']['EventCreateRequest'];
type EventUpdateRequest = components['schemas']['EventUpdateRequest'];
type EventOut = components['schemas']['EventOut'];

// All calendar mutations invalidate every cached month so any open month refetches.
function invalidateCalendar(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'calendar' });
}

// The reminder id is derived deterministically from the event id, so create,
// update (reschedule) and cancel all address the same pending notification.
function reminderIdForEvent(eventId: string): number {
  return uuidToInt(eventId);
}

// (Re)schedule a reminder for the given event if reminders are enabled and the
// event is in the future. Any previously scheduled reminder for this event id is
// overwritten because the notification id is deterministic (same id => replace).
function scheduleReminderForEvent(event: EventOut, remindersEnabled: boolean): void {
  if (!remindersEnabled) return;
  const at = new Date(`${event.date}T${event.time}`);
  // Планируем только для валидной будущей даты (NaN от кривого времени отсекаем).
  if (Number.isNaN(at.getTime()) || at.getTime() <= Date.now()) return;
  void scheduleWorkoutReminder({
    id: reminderIdForEvent(event.id),
    at,
    title: 'Тренировка',
    body: 'Скоро запланированная тренировка',
  });
}

export function useCreateEvent() {
  const qc = useQueryClient();
  const { data: settings } = useNotificationSettings();
  return useMutation({
    mutationFn: async (body: EventCreateRequest) => {
      const { data, error } = await api.POST('/api/v1/calendar/events', { body });
      if (error) throw toApiError(error);
      return data;
    },
    onSuccess: (data) => {
      // Read the "reminders enabled" flag at mutation time (same as update below).
      scheduleReminderForEvent(data, Boolean(settings?.workout_reminders));
    },
    onSettled: () => invalidateCalendar(qc),
  });
}

export function useUpdateEvent() {
  const qc = useQueryClient();
  const { data: settings } = useNotificationSettings();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: EventUpdateRequest }) => {
      const { data, error } = await api.PUT('/api/v1/calendar/events/{event_id}', {
        params: { path: { event_id: id } },
        body,
      });
      if (error) throw toApiError(error);
      return data;
    },
    onSuccess: (data) => {
      // A moved event must not keep firing at the old time. Cancel first, then
      // reschedule at the returned (new) date/time. The notification id is
      // deterministic from the event id, so the cancel targets the exact pending
      // reminder created earlier and the reschedule reuses the same slot.
      void cancelWorkoutReminders([reminderIdForEvent(data.id)]).finally(() => {
        scheduleReminderForEvent(data, Boolean(settings?.workout_reminders));
      });
    },
    onSettled: () => invalidateCalendar(qc),
  });
}

export function useCancelEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await api.DELETE('/api/v1/calendar/events/{event_id}', {
        params: { path: { event_id: id } },
      });
      if (error) throw toApiError(error);
      return data;
    },
    onSuccess: (_data, id) => {
      // Drop the pending local reminder so the user is not notified about a
      // cancelled workout. The reminder id is deterministic from the event id.
      void cancelWorkoutReminders([reminderIdForEvent(id)]);
    },
    onSettled: () => invalidateCalendar(qc),
  });
}
