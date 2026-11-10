/**
 * Progress-photo slot identifier. Lives in `shared` (not `entities/measurement`)
 * because the offline photo queue — a `shared` module — needs it, and `shared`
 * must not import from `entities` under FSD layering. The measurement entity
 * re-exports this type and owns the display labels (PHOTO_KINDS / PHOTO_LABELS).
 */
export type PhotoKind = 'front' | 'back' | 'left' | 'right';
