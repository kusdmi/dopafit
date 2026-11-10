import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { useCustomFields } from '@/entities/measurement/api/use-custom-fields';
import { BASE_FIELDS, EXTRA_FIELDS, FIELD_LABELS } from '@/entities/measurement/model/fields';
import type { PhotoKind } from '@/entities/measurement/model/fields';
import {
  measurementFormSchema,
  type MeasurementFormValues,
  type MeasurementFormInput,
} from '@/entities/measurement/model/schema';
import type { components } from '@/shared/api/schema';
import { safeRandomUUID } from '@/shared/lib/uuid';
import { cameraOutline } from '@/shared/ui/icons';
import { Button } from '@/shared/ui/Button';

import { CustomFieldEditModal } from '../custom-field-edit/CustomFieldEditModal';
import { CustomSlotFields, type CustomValue, type Slot } from './CustomSlotFields';
import { MeasurementField } from './MeasurementField';
import { PhotoPicker } from './PhotoPicker';
import { emptyValues, photosOf, recordToValues, today, unitFor } from './record-mapping';
import { SectionToggle } from './SectionToggle';

type MeasurementOut = components['schemas']['MeasurementOut'];

interface Props {
  onSubmit: (values: MeasurementFormValues & { id: string }) => void | Promise<void>;
  // The record to prefill on mount (today's record, or one loaded from the detail modal).
  initialRecord?: MeasurementOut;
  // Editing a history record may move it to a free date without clearing its fields.
  allowDateMove?: boolean;
  // Resolves an existing record for a given date (from the cached history). When the
  // form's date matches an existing record, the form prefills it and edits in place.
  findRecordByDate?: (date: string) => MeasurementOut | undefined;
}

export function SaveMeasurementForm({
  onSubmit,
  initialRecord,
  allowDateMove = false,
  findRecordByDate,
}: Props) {
  const [id, setId] = useState<string>(() => initialRecord?.id ?? safeRandomUUID());
  const [showExtra, setShowExtra] = useState(true);
  const [showPhotos, setShowPhotos] = useState(true);
  const [editingSlot, setEditingSlot] = useState<Slot | null>(null);
  const boundRecordId = useRef(initialRecord?.id);
  const [serverPhotos, setServerPhotos] = useState<{ kind: PhotoKind; url: string }[]>(() =>
    photosOf(initialRecord),
  );

  const customFields = useCustomFields();

  const { register, handleSubmit, control, setValue, reset, getValues, formState } = useForm<
    MeasurementFormInput,
    unknown,
    MeasurementFormValues
  >({
    mode: 'onChange',
    resolver: zodResolver(measurementFormSchema),
    defaultValues: initialRecord
      ? (recordToValues(initialRecord) as MeasurementFormValues)
      : emptyValues(today()),
  });

  const { errors, isSubmitting, dirtyFields } = formState;
  const customValues = (useWatch({ control, name: 'custom_values' }) ?? []) as CustomValue[];
  const selectedDate = useWatch({ control, name: 'date' });
  const recordForDate = findRecordByDate?.(selectedDate);
  const measurementId = recordForDate?.id ?? id;

  // A restored cache can still contain an optimistic row while the server refetch
  // is in flight. Bind the selected record when it arrives, preserving user edits.
  useEffect(() => {
    if (!recordForDate || boundRecordId.current === recordForDate.id) return;
    boundRecordId.current = recordForDate.id;
    const dirtyValues = Object.fromEntries(
      Object.entries(getValues()).filter(([field]) => field in dirtyFields),
    );
    reset({ ...recordToValues(recordForDate), ...dirtyValues }, { keepDirty: true });
  }, [recordForDate, reset, getValues, dirtyFields]);

  const dateField = register('date');

  // Reactive binding: when the user picks a date that already has a record, prefill and
  // edit it in place; otherwise start a fresh entry for that date. Done in the change
  // handler (a user action) rather than an effect to avoid cascading-render setState.
  const handleDateChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    void dateField.onChange(event);
    const date = event.target.value;
    if (!findRecordByDate || !date) return;

    const record = findRecordByDate(date);
    boundRecordId.current = record?.id;
    if (record) {
      reset(recordToValues(record));
      setId(record.id);
      setServerPhotos(photosOf(record));
    } else if (!allowDateMove) {
      // Пустые значения перечислены поимённо: `reset` с частичным объектом
      // оставил бы поля прошлой даты нетронутыми.
      reset(emptyValues(date));
      setId(safeRandomUUID());
      setServerPhotos([]);
    }
  };

  const handleSlotChange = (slot: Slot, raw: string) => {
    const cf = customFields.data?.find((f) => f.slot === slot);
    const rest = customValues.filter((cv) => cv.slot !== slot);
    if (raw === '' || cf === undefined) {
      setValue('custom_values', rest, { shouldValidate: true, shouldDirty: true });
      return;
    }
    const value = raw;
    setValue('custom_values', [...rest, { slot, name: cf.name, unit: cf.unit, value }], {
      shouldValidate: true,
      shouldDirty: true,
    });
  };

  const submit = handleSubmit((values) => {
    return onSubmit({
      ...values,
      custom_values: values.custom_values ?? [],
      id: measurementId,
    });
  });

  const fieldError = (field: string) =>
    (errors as Record<string, { message?: string }>)[field]?.message;

  return (
    // Figma 758:2425: the form is a 25px-gapped stack of sections; the fields
    // themselves sit in a two-column grid (30px column gap, 15px row gap).
    <form noValidate onSubmit={submit} className="flex flex-col gap-[25px]">
      <div className="flex flex-col gap-[15px]">
        {/* Подпись «Дата» — НАД рамкой, как у всех соседних полей замера
            (756:1986 в макете). Фасад Input кладёт подпись ВНУТРЬ рамки, из-за
            чего на одном экране жили две разные логики подписи: у «Даты»
            внутри, у «Роста»/«Веса» снаружи. MeasurementField даёт ту же
            геометрию и внешнюю подпись. */}
        <MeasurementField
          label="Дата"
          type="date"
          error={errors.date?.message}
          {...dateField}
          value={selectedDate}
          onChange={handleDateChange}
        />

        <div className="grid grid-cols-2 gap-x-[30px] gap-y-[15px]">
          {BASE_FIELDS.map((field) => (
            <MeasurementField
              key={field}
              label={FIELD_LABELS[field]}
              unit={unitFor(field)}
              type="text"
              inputMode="decimal"
              error={fieldError(field)}
              {...register(field as Parameters<typeof register>[0])}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-[15px]">
        <SectionToggle
          label="Дополнительные измерения"
          open={showExtra}
          onToggle={() => setShowExtra((v) => !v)}
        />

        {showExtra && (
          <div className="grid grid-cols-2 gap-x-[30px] gap-y-[15px]">
            {EXTRA_FIELDS.map((field) => (
              <MeasurementField
                key={field}
                label={FIELD_LABELS[field]}
                unit={unitFor(field)}
                type="text"
                inputMode="decimal"
                error={fieldError(field)}
                {...register(field as Parameters<typeof register>[0])}
              />
            ))}

            <CustomSlotFields
              fields={customFields.data}
              values={customValues}
              onChange={handleSlotChange}
              onEditSlot={setEditingSlot}
              errors={Object.fromEntries(
                customValues.map((value, index) => [
                  value.slot,
                  errors.custom_values?.[index]?.value?.message,
                ]),
              )}
            />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-[15px]">
        <SectionToggle
          label="Фотографии"
          icon={cameraOutline}
          open={showPhotos}
          onToggle={() => setShowPhotos((v) => !v)}
        />

        {/* key по записи: локально выбранные превью и отметки об удалении живут
            внутри PhotoPicker и относятся к конкретному замеру. Без ремонта
            снимки, выбранные для прошлой даты, оставались висеть на новой. */}
        {showPhotos && (
          <PhotoPicker
            key={measurementId}
            measurementId={measurementId}
            serverPhotos={recordForDate ? photosOf(recordForDate) : serverPhotos}
          />
        )}
      </div>

      <Button type="submit" variant="primary" loading={isSubmitting}>
        Сохранить
      </Button>

      <CustomFieldEditModal
        // Remount per slot so the inputs initialise from the opened slot's saved
        // name/unit; the previous instance still plays its dismiss animation via isOpen.
        key={editingSlot ?? 'none'}
        slot={editingSlot ?? 0}
        isOpen={editingSlot !== null}
        initialName={customFields.data?.find((f) => f.slot === editingSlot)?.name}
        initialUnit={customFields.data?.find((f) => f.slot === editingSlot)?.unit}
        onClose={() => setEditingSlot(null)}
      />
    </form>
  );
}
