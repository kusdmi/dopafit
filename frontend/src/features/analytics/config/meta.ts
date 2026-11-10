import type { BodyParameter, WorkoutMetric } from './types';

export const METRIC_META: { id: WorkoutMetric; label: string }[] = [
  { id: 'weight', label: 'Вес' },
  { id: 'reps', label: 'Повторения' },
  { id: 'sets', label: 'Подходы' },
];

// Chart series colors — the dedicated `--color-chart-1..6` palette from
// design-system.md ("Серии графиков"), which is exactly six hues for exactly
// six body parameters. Figma names these variables "Ан - Оранжевый" /
// "Ан - Синий" (Ан = аналитика), and the anthropometry mock (793:4331 /
// 852:1812) pins Вес → chart-1, Талия → chart-3, Грудь → chart-4; the
// remaining three take the rest of the palette in order.
//
// The same value doubles as a SOLID FILL behind text (the parameter buttons in
// AnthropometryForm) and as TEXT/BORDER (StatCard `accentColor`), so it must be a
// fixed value rather than a theme-shifting alias: the chart tokens are literal
// hexes (chart-1 aliases --color-brand-400, itself a fixed step), identical in
// both themes.
//
// They are NOT all safe under light text, though: chart-3 (#2CD08A) and
// chart-5 (#FFD23F) are bright, scoring 1.91:1 and 1.38:1 against
// --neutral-50. Each entry therefore also carries `onColor` — the matching
// `--color-chart-N-fg` token, resolved per hue in index.css — which callers
// painting text ON the fill must use instead of assuming a light foreground.
export interface ParamMeta {
  id: BodyParameter;
  label: string;
  /** Series line/marker color, and the fill when used as a chip background. */
  color: string;
  /** Readable text color to pair with `color` when it is a solid fill. */
  onColor: string;
}

export const PARAM_META: ParamMeta[] = [
  ...(['height', 'shoulder', 'ankle', 'calf', 'forearm', 'wrist', 'neck'] as const).map(
    (id, i) => ({
      id,
      label: {
        height: 'Рост',
        shoulder: 'Плечи',
        ankle: 'Лодыжка',
        calf: 'Икра',
        forearm: 'Предплечье',
        wrist: 'Запястье',
        neck: 'Шея',
      }[id],
      color: `var(--color-chart-${(i % 6) + 1})`,
      onColor: `var(--color-chart-${(i % 6) + 1}-fg)`,
    }),
  ),
  { id: 'weight', label: 'Вес', color: 'var(--color-chart-1)', onColor: 'var(--color-chart-1-fg)' },
  {
    id: 'waist',
    label: 'Талия',
    color: 'var(--color-chart-3)',
    onColor: 'var(--color-chart-3-fg)',
  },
  {
    id: 'chest',
    label: 'Грудь',
    color: 'var(--color-chart-4)',
    onColor: 'var(--color-chart-4-fg)',
  },
  { id: 'hips', label: 'Бёдра', color: 'var(--color-chart-2)', onColor: 'var(--color-chart-2-fg)' },
  {
    id: 'biceps',
    label: 'Бицепс',
    color: 'var(--color-chart-6)',
    onColor: 'var(--color-chart-6-fg)',
  },
  {
    id: 'thigh',
    label: 'Бедро',
    color: 'var(--color-chart-5)',
    onColor: 'var(--color-chart-5-fg)',
  },
];
