// Measurements domain: body measurements, custom fields and progress photos.
import type { Day, Id, Instant } from "./shared.js";

export const measurementFields = [
  "height",
  "weight",
  "waist",
  "chest",
  "hips",
  "thigh",
  "shoulder",
  "ankle",
  "calf",
  "biceps",
  "forearm",
  "wrist",
  "neck",
] as const;
export type MeasurementField = (typeof measurementFields)[number];
/**
 * The subset of measurement fields the anthropometry chart plots, and the only values its
 * responses echo back — the contract's `BodyParameter` enum. Narrower than `MeasurementField`,
 * which covers every column a measurement row can hold.
 */
export const bodyParameters = measurementFields;
export type BodyParameter = (typeof bodyParameters)[number];
export interface CustomValue {
  slot: number;
  name: string;
  unit: string;
  value: number;
}
export type MeasurementValues = Record<MeasurementField, number | null> & {
  custom_values: CustomValue[];
};
export type MeasurementDraft = MeasurementValues & { id?: Id | null; date: Day };
export type Measurement = MeasurementValues & {
  id: Id;
  user_id: Id;
  date: Day;
  updated_at: Instant;
};
export interface CustomField {
  slot: number;
  name: string;
  unit: string;
}
export type PhotoKind = "front" | "back" | "left" | "right";
export interface Photo {
  measurement_id: Id;
  kind: PhotoKind;
  object_key: string;
  date?: Day;
}
