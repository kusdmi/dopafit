import { useSessionStore } from '@/entities/session/model/store';
import { useState } from 'react';
import { PageContent, Page, useToast } from '@/shared/ui/primitives';
import { RootPageHeader } from '@/shared/ui/RootPageHeader';
import { useIsRestoring } from '@tanstack/react-query';

import { useMeasurements } from '@/entities/measurement/api/use-measurements';
import { useDrainPhotoQueueOnline } from '@/entities/measurement/api/use-drain-photo-queue';
import { useDeleteMeasurement } from '@/entities/measurement/api/use-delete-measurement';
import { DuplicateDialog } from '@/features/measurements/duplicate-dialog/DuplicateDialog';
import { SaveMeasurementForm } from '@/features/measurements/save-form/SaveMeasurementForm';
import type { components } from '@/shared/api/schema';
import { localDateKey } from '@/shared/lib/time/localDateKey';
import { useNetworkStatus } from '@/shared/lib/network/useNetworkStatus';
import { MeasurementHistory } from '@/pages/measurements/history/MeasurementHistory';
import { DeferredLoading } from '@/shared/ui/DeferredLoading';
import { Skeleton } from '@/shared/ui/Skeleton';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';

import { MeasurementDetailModal } from './MeasurementDetailModal';
import { useMeasurementSubmit } from './model/useMeasurementSubmit';

type MeasurementOut = components['schemas']['MeasurementOut'];

function OwnMeasurementsPage() {
  const measurements = useMeasurements();
  const deleteMeasurement = useDeleteMeasurement();
  const { isOnline } = useNetworkStatus();
  const [presentToast] = useToast();
  // The persisted measurements cache hydrates asynchronously after the first render.
  // Gate the form until that finishes so it mounts once with today's record already
  // resolved into defaultValues (a post-mount prefill raced with react-hook-form
  // dirtying the empty number fields).
  const isRestoring = useIsRestoring();

  // Flush any photos queued while offline as soon as the network recovers.
  useDrainPhotoQueueOnline();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Bump to force the form to remount when loading a record from the detail modal.
  const [formKey, setFormKey] = useState(0);
  const [editRecord, setEditRecord] = useState<MeasurementOut | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MeasurementOut | null>(null);

  const items = measurements.data?.items ?? [];

  const findRecordByDate = (date: string): MeasurementOut | undefined =>
    items.find((item) => item.date === date);
  const findRecordById = (id: string): MeasurementOut | undefined =>
    items.find((item) => item.id === id);

  // Локальная дата пользователя: по UTC восточнее Гринвича сегодняшняя запись
  // не находилась, и форма открывалась как новая на вчерашней дате.
  const todayStr = localDateKey();
  // Prefill the form with the loaded record, or today's record if one exists.
  const initialRecord = editRecord ?? findRecordByDate(todayStr);

  const save = useMeasurementSubmit({ findRecordByDate, findRecordById, presentToast });

  const handleLoad = (record: MeasurementOut) => {
    setEditRecord(record);
    setFormKey((k) => k + 1);
    setSelectedId(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMeasurement.mutateAsync(deleteTarget.id);
      if (editRecord?.id === deleteTarget.id) setEditRecord(null);
      setFormKey((key) => key + 1);
      setDeleteTarget(null);
    } catch {
      await presentToast({ message: 'Не удалось удалить замер', duration: 2500 });
    }
  };

  return (
    // Figma 756:1712 puts the screen on the primary gradient with the title
    // floating on it — no header plate — and a Body S strapline underneath
    // (756:1979 = заголовок 36px + Body S 18px). Обе строки идут через общий
    // RootPageHeader, как на «Программах».
    <Page background="gradient">
      <RootPageHeader
        title="Данные антропометрии"
        subtitle="Введите ваши замеры в выбранную дату"
      />
      <PageContent className="page-padding">
        <div className="mx-auto flex max-w-md flex-col gap-[25px]">
          <DeferredLoading
            loading={isRestoring || measurements.isLoading}
            fallback={<Skeleton variant="form" count={3} />}
          >
            <SaveMeasurementForm
              key={formKey}
              onSubmit={save.submit}
              initialRecord={initialRecord}
              allowDateMove={editRecord !== null}
              findRecordByDate={findRecordByDate}
            />
          </DeferredLoading>
          {save.error && (
            <p role="alert" className="text-body-s text-danger">
              {save.error}
            </p>
          )}

          <section className="flex flex-col gap-[15px]">
            <h2 className="text-h2 text-content">История записей</h2>
            <MeasurementHistory onSelect={setSelectedId} />
          </section>
        </div>

        <MeasurementDetailModal
          id={selectedId}
          isOpen={selectedId != null}
          onClose={() => setSelectedId(null)}
          onLoad={handleLoad}
          onDelete={(record) => {
            setSelectedId(null);
            setDeleteTarget(record);
          }}
          isOnline={isOnline}
        />

        <ConfirmDialog
          isOpen={deleteTarget !== null}
          title="Удалить замер?"
          message="Данные и фотографии этой записи будут удалены."
          confirmLabel="Удалить"
          destructive
          pending={deleteMeasurement.isPending}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeleteTarget(null)}
        />

        <DuplicateDialog
          rows={save.conflictRows}
          customRows={save.conflictCustomRows}
          isOpen={save.conflict != null}
          onCancel={save.cancelConflict}
          onConfirm={save.confirmConflict}
        />
      </PageContent>
    </Page>
  );
}

export function MeasurementsPage() {
  const userId = useSessionStore((s) => s.user?.id);
  return <OwnMeasurementsPage key={userId ?? 'self'} />;
}
