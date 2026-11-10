import type { PhotoKind } from '@/shared/lib/offline/photo-kind';

// PhotoKind is defined in `shared` (the offline photo queue needs it and shared
// must not import from entities). Re-export it here so existing entity consumers
// keep importing it from the measurement model.
export type { PhotoKind };

export const BASE_FIELDS = ['height', 'weight', 'waist', 'chest'] as const;

export const EXTRA_FIELDS = [
  'hips',
  'thigh',
  'shoulder',
  'ankle',
  'calf',
  'biceps',
  'forearm',
  'wrist',
  'neck',
] as const;

export const ALL_FIELDS = [...BASE_FIELDS, ...EXTRA_FIELDS] as const;

export type MeasurementField = (typeof ALL_FIELDS)[number];

export const FIELD_LABELS: Record<MeasurementField, string> = {
  height: 'Рост',
  weight: 'Вес',
  waist: 'Талия',
  chest: 'Грудь',
  hips: 'Бёдра',
  thigh: 'Бедро',
  shoulder: 'Плечо',
  ankle: 'Лодыжка',
  calf: 'Голень',
  biceps: 'Бицепс',
  forearm: 'Предплечье',
  wrist: 'Запястье',
  neck: 'Шея',
};

export const PHOTO_KINDS = ['front', 'back', 'left', 'right'] as const satisfies readonly PhotoKind[];
export const PHOTO_LABELS: Record<PhotoKind, string> = {
  front: 'Спереди',
  back: 'Сзади',
  left: 'Слева',
  right: 'Справа',
};
