import { onlineManager, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { measurementsListKey } from '@/entities/measurement/api/use-measurements';
import { useSaveMeasurement } from '@/entities/measurement/api/use-save-measurement';
import { useUpdateMeasurement } from '@/entities/measurement/api/use-update-measurement';
import { processPhotoQueue } from '@/entities/measurement/api/use-photo-upload';
import {
  measurementFormSchema,
  type MeasurementFormValues,
} from '@/entities/measurement/model/schema';
import { diffCustomValues, diffMeasurements } from '@/features/measurements/duplicate-dialog/diff';
import type { components } from '@/shared/api/schema';
import { measurementError } from '@/entities/measurement/model/errors';
import { persistOfflineState } from '@/shared/lib/query/persistQueryClient';

type MeasurementOut = components['schemas']['MeasurementOut'];
type SubmittedValues = MeasurementFormValues & { id: string };

interface ConflictState {
  existing: MeasurementOut;
  submitted: SubmittedValues;
}

type Toast = (options: {
  message: string;
  duration?: number;
  position?: 'top' | 'middle' | 'bottom';
}) => Promise<unknown>;

interface Options {
  findRecordByDate: (date: string) => MeasurementOut | undefined;
  findRecordById: (id: string) => MeasurementOut | undefined;
  presentToast: Toast;
}

export interface MeasurementSubmit {
  error: string | null;
  submit: (values: SubmittedValues) => Promise<void>;
  /** Незакрытый конфликт «запись на эту дату уже есть». */
  conflict: ConflictState | null;
  conflictRows: ReturnType<typeof diffMeasurements>;
  conflictCustomRows: ReturnType<typeof diffCustomValues>;
  confirmConflict: () => Promise<void>;
  cancelConflict: () => void;
}

/**
 * Сохранение замера со всей офлайн-механикой: создание, правка существующей
 * записи через PUT, слив очереди фотографий и разрешение конфликта дат.
 *
 * Живёт отдельно от разметки: тут важен порядок операций и гонки с потерей сети.
 */
export function useMeasurementSubmit({
  findRecordByDate,
  findRecordById,
  presentToast,
}: Options): MeasurementSubmit {
  const queryClient = useQueryClient();
  const saveMutation = useSaveMeasurement();
  const updateMutation = useUpdateMeasurement();
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ConflictState | null>(null);

  const persistQueued = async (variables: unknown) => {
    await new Promise<void>((resolve, reject) => {
      const check = () => {
        const mutation = queryClient
          .getMutationCache()
          .getAll()
          .find((m) => m.state.variables === variables);
        if (mutation?.state.status === 'error') {
          unsubscribe();
          reject(mutation.state.error);
        } else if (mutation?.state.isPaused && mutation.state.context != null) {
          unsubscribe();
          resolve();
        }
      };
      const unsubscribe = queryClient.getMutationCache().subscribe(check);
      check();
    });
    await persistOfflineState(queryClient);
  };

  // Drain queued photos for the record and refresh the list once they land. The
  // list invalidation fired by the update mutation defaults runs before queued
  // photos finish draining, so its refetch can't yet see the new serverPhotos.
  const drainPhotosFor = (clientId: string, serverId: string) => {
    void processPhotoQueue((cId) => (cId === clientId ? serverId : undefined)).then((uploaded) => {
      if (uploaded > 0) {
        void queryClient.invalidateQueries({ queryKey: measurementsListKey });
      }
    });
  };

  // Updating an existing record always uses PUT (a POST with the same id is an
  // idempotent no-op on the server and would not persist edits). Offline-first via
  // useUpdateMeasurement: a paused edit dehydrates and replays after a restart.
  // Returns whether the caller may close its UI: true on success OR when the edit
  // was queued offline (mirrors the create path, which never blocks the form), and
  // false on a real online failure so the user can retry.
  const putMeasurement = async (
    existing: MeasurementOut,
    submitted: SubmittedValues,
  ): Promise<boolean> => {
    const vars = {
      measurementId: existing.id,
      body: { ...submitted, id: existing.id, custom_values: submitted.custom_values ?? [] },
    };

    // Offline: the mutation pauses (mutateAsync would never resolve). Fire-and-forget
    // so it queues, then let the caller close its UI — the edit is safely persisted.
    if (!onlineManager.isOnline()) {
      updateMutation.mutate(vars);
      try {
        await persistQueued(vars);
      } catch {
        return false;
      }
      drainPhotosFor(submitted.id, existing.id);
      return true;
    }

    // If the network drops mid-retry, TanStack PAUSES the mutation and
    // mutateAsync never resolves — which would freeze the confirm dialog open.
    // Race the mutation against an "went offline" signal: if we go offline while
    // it's in flight, the edit is safely queued in the outbox, so treat it as a
    // successful (queued) submit and let the caller close its UI.
    let unsub: (() => void) | undefined;
    const wentOffline = new Promise<'offline'>((resolve) => {
      unsub = onlineManager.subscribe((online) => {
        if (!online) resolve('offline');
      });
    });
    const donePromise = updateMutation.mutateAsync(vars).then(() => 'done' as const);
    // If the 'offline' branch wins the race, donePromise is still pending and may
    // reject LATER (the paused mutation eventually fails on replay). Nothing awaits
    // the loser, so swallow that late rejection to avoid an unhandled rejection.
    // The online-failure path still sees the rejection through the race below.
    donePromise.catch(() => {});
    try {
      const outcome = await Promise.race([donePromise, wentOffline]);
      // Always drop the online-manager subscription: on the 'done' path the
      // callback never fired, so without this it would leak past every edit.
      unsub?.();
      drainPhotosFor(submitted.id, existing.id);
      if (outcome === 'offline') {
        await persistOfflineState(queryClient);
        await presentToast({
          message: 'Нет сети — изменения сохранятся при подключении',
          duration: 2500,
          position: 'bottom',
        });
      }
      return true;
    } catch (err) {
      // Real online failure (mutation rejected before we went offline).
      unsub?.();
      setError(measurementError(err));
      await presentToast({
        message: measurementError(err),
        duration: 2500,
        position: 'bottom',
      });
      return false;
    }
  };

  const hasChanges = (existing: MeasurementOut, values: SubmittedValues) => {
    const fieldRows = diffMeasurements(
      existing as unknown as Record<string, number | null | undefined>,
      values as unknown as Record<string, number | null | undefined>,
    );
    // Derive the custom-change flag from the SAME diff the dialog renders, so the
    // dialog opens iff there are rows — value, rename or unit changes all count, a
    // pure reorder does not. A raw JSON compare would flag reorders that
    // diffCustomValues drops, opening an empty dialog.
    const customRows = diffCustomValues(existing.custom_values, values.custom_values);
    return fieldRows.length > 0 || customRows.length > 0;
  };

  const submit = async (values: SubmittedValues) => {
    setError(null);
    const validation = measurementFormSchema.safeParse(values);
    if (!validation.success) {
      await presentToast({
        message: validation.error.issues.map((issue) => issue.message).join('; '),
        duration: 4000,
      });
      return;
    }
    values = { ...validation.data, id: values.id };
    const original = findRecordById(values.id);
    const existing = findRecordByDate(values.date);

    if (original && !existing) {
      // Moving a history record to a free date must update that row. POST with
      // its existing ID is idempotent and would return the old date unchanged.
      await putMeasurement(original, values);
      return;
    }

    if (existing) {
      if (!hasChanges(existing, values)) {
        // Only photos may have changed: PUT so queued photos attach, no dialog needed.
        await putMeasurement(existing, values);
        return;
      }
      setConflict({ existing, submitted: values });
      return;
    }

    const body = { ...values, custom_values: values.custom_values ?? [] };
    const result = saveMutation.mutateAsync(body);
    result.catch(() => {});
    if (!onlineManager.isOnline()) {
      try {
        await persistQueued(body);
        await presentToast({ message: 'Замер сохранён на устройстве', duration: 2500 });
      } catch {
        await presentToast({ message: 'Не удалось сохранить замер на устройстве', duration: 2500 });
      }
      return;
    }
    let unsubscribe: (() => void) | undefined;
    const offline = new Promise<'offline'>((resolve) => {
      unsubscribe = onlineManager.subscribe((online) => {
        if (!online) resolve('offline');
      });
    });
    try {
      const outcome = await Promise.race([result, offline]);
      if (outcome === 'offline') await persistQueued(body);
      else drainPhotosFor(values.id, outcome.id);
    } catch (error) {
      setError(measurementError(error));
      await presentToast({ message: measurementError(error), duration: 4000 });
    } finally {
      unsubscribe?.();
    }
  };

  const confirmConflict = async () => {
    if (!conflict) return;
    const ok = await putMeasurement(conflict.existing, conflict.submitted);
    // Keep the dialog open on a real failure so the edit isn't silently lost and
    // the user can retry; close on success or when the edit was queued offline.
    if (ok) setConflict(null);
  };

  const conflictRows = conflict
    ? diffMeasurements(
        conflict.existing as unknown as Record<string, number | null | undefined>,
        conflict.submitted as unknown as Record<string, number | null | undefined>,
      )
    : [];
  // Custom-field changes are diffed separately by slot: the standard-field diff
  // above ignores them, so a custom-only edit would otherwise show an empty dialog.
  const conflictCustomRows = conflict
    ? diffCustomValues(conflict.existing.custom_values, conflict.submitted.custom_values)
    : [];

  return {
    error,
    submit,
    conflict,
    conflictRows,
    conflictCustomRows,
    confirmConflict,
    cancelConflict: () => setConflict(null),
  };
}
