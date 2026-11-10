import type { components } from '@/shared/api/schema';
import { pencilOutline } from '@/shared/ui/icons';
import { Icon } from '@/shared/ui/primitives';

import { MeasurementField } from './MeasurementField';

type CustomField = components['schemas']['CustomFieldOut'];
export type CustomValue = { slot: number; name: string; unit: string; value: number | string };

export const SLOTS = [1, 2, 3] as const;
export type Slot = (typeof SLOTS)[number];

interface Props {
  fields: CustomField[] | undefined;
  values: CustomValue[];
  onChange: (slot: Slot, raw: string) => void;
  onEditSlot: (slot: Slot) => void;
  errors?: Record<number, string | undefined>;
}

/** Три пользовательских поля замера: значение плюс карандаш переименования. */
export function CustomSlotFields({ fields, values, onChange, onEditSlot, errors }: Props) {
  const valueFor = (slot: number): number | string => {
    const found = values.find((cv) => cv.slot === slot);
    return found ? found.value : '';
  };

  return (
    <>
      {SLOTS.map((slot) => {
        const cf = fields?.find((f) => f.slot === slot);
        return (
          <MeasurementField
            key={slot}
            label={cf ? `${cf.name}${cf.unit ? `, ${cf.unit}` : ''}` : `Доп. поле ${slot}`}
            unit={cf?.unit || 'см'}
            disabled={!cf}
            placeholder={!cf ? 'Задайте название поля' : undefined}
            type="text"
            inputMode="decimal"
            error={errors?.[slot]}
            value={valueFor(slot)}
            onChange={(e) => onChange(slot, e.target.value)}
            // The rename pencil sits beside the slot's label rather than in a
            // separate control column.
            labelAction={
              <button
                type="button"
                aria-label={`Изменить поле ${slot}`}
                onClick={() => onEditSlot(slot)}
                className="shrink-0 text-brand-text"
              >
                <Icon icon={pencilOutline} style={{ fontSize: 18 }} />
              </button>
            }
          />
        );
      })}
    </>
  );
}
