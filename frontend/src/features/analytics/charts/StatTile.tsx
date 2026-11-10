import type { ReactNode } from 'react';

interface Props {
  caption: string;
  value: ReactNode;
  /** Series/accent colour driving the tint and the caption. */
  color: string;
}

/**
 * A workouts-summary tile (Figma 771:1788/1793/1798): a 14px-radius box tinted
 * at 10% of an accent colour, with a small coloured caption over a bold value.
 *
 * The mock hardcodes three rgba() tints (78,205,196 / 255,112,3 / 86,204,242)
 * that do not all correspond to design-system variables; the tint is instead
 * derived with color-mix from the chart token passed in, so no literal rgba
 * lands in the component and the tile stays on the system palette.
 */
export function StatTile({ caption, value, color }: Props) {
  return (
    <div
      className="flex flex-col gap-1 rounded-[14px] p-3"
      style={{ background: `color-mix(in srgb, ${color} 10%, transparent)` }}
    >
      {/* The caption keeps --muted rather than the accent the mock uses: the
          chart palette drops to 1.3-2.8:1 on light-theme backgrounds, and this
          is 11px text. The tint already carries the colour association. */}
      <span className="text-caption text-muted">{caption}</span>
      <span className="text-h2 text-content">{value}</span>
    </div>
  );
}
