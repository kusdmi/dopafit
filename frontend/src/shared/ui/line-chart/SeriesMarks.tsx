import type { SeriesShape } from './series-encoding';

/**
 * One data marker, drawn in the shape assigned to its series. `r` is the
 * circumradius, so every shape occupies the same visual footprint as the
 * circle it replaces and the active-point sizing (r=5) still lines up.
 */
export function Marker({
  shape,
  cx,
  cy,
  r,
  fill,
  stroke,
  strokeWidth,
}: {
  shape: SeriesShape;
  cx: number;
  cy: number;
  r: number;
  fill: string;
  stroke?: string;
  strokeWidth?: number;
}) {
  const common = { fill, stroke, strokeWidth };
  if (shape === 'square') {
    // Side chosen so the square's area matches the circle's, keeping the
    // markers optically the same weight rather than the square looking bigger.
    const side = r * Math.sqrt(Math.PI);
    return <rect x={cx - side / 2} y={cy - side / 2} width={side} height={side} {...common} />;
  }
  if (shape === 'diamond') {
    const d = r * 1.25; // slightly larger: a rotated square reads smaller
    return (
      <polygon
        points={`${cx},${cy - d} ${cx + d},${cy} ${cx},${cy + d} ${cx - d},${cy}`}
        {...common}
      />
    );
  }
  return <circle cx={cx} cy={cy} r={r} {...common} />;
}

/**
 * Legend/tooltip swatch mirroring a series' line: same colour, same marker
 * shape, same dash pattern. Without this the extra channel would exist only on
 * the plot and the key would still be colour-only, which defeats the point.
 */
export function SeriesSwatch({
  color,
  shape,
  dash,
}: {
  color: string;
  shape: SeriesShape;
  dash: string | undefined;
}) {
  return (
    <svg
      width={18}
      height={10}
      viewBox="0 0 18 10"
      aria-hidden="true"
      className="inline-block shrink-0"
    >
      <line x1={0} x2={18} y1={5} y2={5} stroke={color} strokeWidth={2} strokeDasharray={dash} />
      <Marker shape={shape} cx={9} cy={5} r={3} fill={color} />
    </svg>
  );
}
