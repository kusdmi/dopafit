import { formatDateShort } from '../../lib/time/formatDate';

import { dashFor, shapeFor } from './series-encoding';
import { SeriesSwatch } from './SeriesMarks';
import type { ChartPoint, ChartSeries } from './types';

// Gap between the active point and the tooltip box, in px. Large enough that the
// box sits well clear ABOVE the fingertip covering the point.
const TOOLTIP_GAP = 48;
const W = 148;
// Запас вокруг плашки, чтобы мягкая тень не обрезалась границей foreignObject.
const PAD_FO = 6;

interface Props {
  activeDate: string;
  series: ChartSeries[];
  /** Дублирующее кодирование (штрих/форма) включено — серий больше одной. */
  decorate: boolean;
  xOf: (date: string) => number;
  yOf: (value: number) => number;
  viewW: number;
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

/** Плашка со значениями всех серий в активной дате, позиционируемая у точки. */
export function ChartTooltip({ activeDate, series, decorate, xOf, yOf, viewW }: Props) {
  const rows = series
    .map((s, i) => ({ s, i, p: s.points.find((pt) => pt.date === activeDate) }))
    .filter((r): r is { s: ChartSeries; i: number; p: ChartPoint } => r.p !== undefined);

  // Якорь плашки — самая верхняя активная точка (минимальный y).
  const pointX = xOf(activeDate);
  const pointY = Math.min(...rows.map((r) => yOf(r.p.value)));
  // H = paddingY*2 + headerHeight + rows*lineHeight
  const H = 16 + 18 + rows.length * 18;
  // По X плашку держим внутри viewBox (с запасом PAD_FO), чтобы она не
  // уезжала за боковые края. По Y, наоборот, разрешаем выход за нижнюю
  // границу — его показывает overflow:visible на svg.
  const x = clamp(pointX - W / 2, PAD_FO, viewW - W - PAD_FO);
  // Над точкой с запасом TOOLTIP_GAP, чтобы плашка была выше пальца,
  // прикрывающего точку. Если сверху не влезает — под точкой (там палец
  // мешает меньше, чем обрезка сверху), тоже с увеличенным зазором.
  const yAbove = pointY - H - TOOLTIP_GAP;
  const y = yAbove < PAD_FO ? pointY + TOOLTIP_GAP : yAbove;

  return (
    <foreignObject
      x={x - PAD_FO}
      y={y - PAD_FO}
      width={W + PAD_FO * 2}
      height={H + PAD_FO * 2}
      data-tooltip
    >
      <div style={{ padding: PAD_FO }}>
        <div
          className="flex flex-col gap-0.5 rounded-lg border border-line bg-card px-2.5 py-2 text-caption text-content shadow-overlay"
          style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.15)' }}
        >
          <span className="text-label">{formatDateShort(activeDate)}</span>
          {rows.map(({ s, i, p }) => (
            <span key={`t-${s.id}`} className="flex items-center gap-1">
              {/* Swatch repeats the line's shape and dash, not just its colour
                  — a colour-only key would leave the second channel unreadable. */}
              <SeriesSwatch
                color={s.color}
                shape={decorate ? shapeFor(i) : 'circle'}
                dash={decorate ? dashFor(i) : undefined}
              />
              <span>
                {s.label ?? s.id}: {p.value}
              </span>
            </span>
          ))}
        </div>
      </div>
    </foreignObject>
  );
}
