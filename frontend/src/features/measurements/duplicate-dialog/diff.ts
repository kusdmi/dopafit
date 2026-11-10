import { ALL_FIELDS, FIELD_LABELS, type MeasurementField } from '@/entities/measurement/model/fields';

export interface DiffRow {
  field: MeasurementField;
  label: string;
  before: number | undefined;
  after: number | undefined;
}

type Values = Partial<Record<MeasurementField, number | null | undefined>>;

// Backend returns null for empty fields; the form holds undefined. Treat both as "empty".
function normalize(value: number | null | undefined): number | undefined {
  return value ?? undefined;
}

export function diffMeasurements(before: Values, after: Values): DiffRow[] {
  const rows: DiffRow[] = [];
  for (const field of ALL_FIELDS) {
    const b = normalize(before[field]);
    const a = normalize(after[field]);
    if (b !== a) {
      rows.push({ field, label: FIELD_LABELS[field], before: b, after: a });
    }
  }
  return rows;
}

/** A single custom measurement slot (name/unit are the field's configuration). */
export interface CustomValue {
  slot: number;
  name: string;
  unit: string;
  value: number;
}

export interface CustomDiffRow {
  slot: number;
  /** Field name, prefer the newer value's name (a rename still labels the slot). */
  label: string;
  /** Previous name, present only when the field was renamed. */
  labelBefore?: string;
  unit: string;
  /** Previous unit, present only when the unit changed. */
  unitBefore?: string;
  before: number | undefined;
  after: number | undefined;
}

/**
 * Diffs custom measurement values by slot so the confirm dialog reflects changes
 * that touch ONLY custom fields (the standard-field diff misses them entirely,
 * leaving the dialog empty). A slot present on one side only is a real
 * change: an added value (before undefined) or a removed one (after undefined).
 * The label/unit come from whichever side still holds the slot (prefer the newer
 * side so a rename is reflected).
 *
 * A row is emitted when the value OR the name OR the unit changed. hasChanges (in
 * MeasurementsPage) opens the confirm dialog on ANY custom change including a
 * rename/unit-only edit; if this diff reported value-changes only, that path would
 * open an empty dialog. labelBefore/unitBefore are set only when they
 * actually changed so the dialog can surface the rename/unit edit.
 */
export function diffCustomValues(
  before: readonly CustomValue[] | null | undefined,
  after: readonly CustomValue[] | null | undefined,
): CustomDiffRow[] {
  const beforeBySlot = new Map((before ?? []).map((c) => [c.slot, c]));
  const afterBySlot = new Map((after ?? []).map((c) => [c.slot, c]));
  const slots = [...new Set([...beforeBySlot.keys(), ...afterBySlot.keys()])].sort((a, b) => a - b);

  const rows: CustomDiffRow[] = [];
  for (const slot of slots) {
    const b = beforeBySlot.get(slot);
    const a = afterBySlot.get(slot);
    const meta = a ?? b;
    if (!meta) continue;
    // Only compare name/unit when the slot exists on both sides (a rename is
    // meaningless for an added/removed slot — the value change already covers it).
    const renamed = b != null && a != null && b.name !== a.name;
    const unitChanged = b != null && a != null && b.unit !== a.unit;
    const valueChanged = b?.value !== a?.value;
    if (!valueChanged && !renamed && !unitChanged) continue;
    rows.push({
      slot,
      label: meta.name,
      ...(renamed ? { labelBefore: b?.name } : {}),
      unit: meta.unit,
      ...(unitChanged ? { unitBefore: b?.unit } : {}),
      before: b?.value,
      after: a?.value,
    });
  }
  return rows;
}
