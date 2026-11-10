import { useCallback, useMemo, useRef } from 'react';

import { formatDateShort } from '../lib/time/formatDate';

import { ChartTooltip } from './line-chart/ChartTooltip';
import { computeGeometry, PAD } from './line-chart/geometry';
import { dashFor, shapeFor } from './line-chart/series-encoding';
import { Marker, SeriesSwatch } from './line-chart/SeriesMarks';
import { useMeasuredWidth } from './line-chart/useMeasuredWidth';
import type { ChartSeries } from './line-chart/types';
import { useScrub } from './line-chart/useScrub';

// Публичный API графика: потребители берут типы отсюда.
export type { ChartPoint, ChartSeries } from './line-chart/types';

interface Props {
  series: ChartSeries[];
  emptyLabel?: string;
  height?: number;
}

export function LineChart({ series, emptyLabel = 'Данные отсутствуют', height = 180 }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const viewW = useMeasuredWidth(svgRef);
  // Геометрия зависит только от данных и размеров области, поэтому мемоизируем:
  // скраб меняет активный индекс на 60–120 Гц и не должен пересчитывать шкалы,
  // тики и выборку подписей каждый кадр.
  const { hasData, dates, xOf, yOf, yTicks, formatTick, xLabelIdx } = useMemo(
    () => computeGeometry(series, viewW, height),
    [series, viewW, height],
  );

  // Переводит координату пальца в индекс точки. Размеры узла читаем в момент
  // жеста, а не из рендера: во время скраба ширина уже измерена и актуальна.
  const pointCount = dates.length;
  const indexFromClientX = useCallback(
    (clientX: number, node: SVGSVGElement | null) => {
      const rect = node?.getBoundingClientRect();
      if (!rect || rect.width === 0) return 0;
      const ratio = (clientX - rect.left) / rect.width;
      const xInView = ratio * viewW;
      const plotW = viewW - PAD.left - PAD.right;
      const rel = Math.min(Math.max((xInView - PAD.left) / (plotW || 1), 0), 1);
      return Math.round(rel * Math.max(pointCount - 1, 0));
    },
    [viewW, pointCount],
  );

  const { activeIdx, setSvgRef, handlers } = useScrub({ svgRef, indexFromClientX });

  // Apply the redundant dash/shape encoding only when more than one series is
  // plotted. With a single line there is nothing to disambiguate, so the extra
  // channel would only cost legibility (a dashed line reads worse than a solid
  // one); with two or more it is what makes them tellable apart without colour.
  const decorate = series.length > 1;

  if (!hasData) {
    return (
      // Без рамки: график живёт внутри карточки (ChartCard), и обведённый
      // прямоугольник внутри обведённого читается как второй, вложенный
      // блок. Пустое состояние — это отсутствие графика, а не объект, так
      // что ему достаточно подписи в той же области.
      <div
        className="flex items-center justify-center text-body-m text-muted"
        style={{ height }}
      >
        {emptyLabel}
      </div>
    );
  }

  const chart = (
    <svg
      ref={setSvgRef}
      // viewW = фактическая ширина контейнера в px, поэтому viewBox совпадает с
      // отрисованным размером 1:1. Сохраняем дефолтный preserveAspectRatio: при
      // совпадении пропорций график заполняет всю ширину без искажений штрихов,
      // точек и текста; если ширина ещё не измерена (редкий кадр / jsdom) —
      // график просто центрируется без растяжения, без овальных точек.
      viewBox={`0 0 ${viewW} ${height}`}
      width="100%"
      height={height}
      // Transparent, not a --card plate: the analytics mocks draw the plot
      // straight onto the page gradient inside the ChartCard's outline. The
      // active-point halo below follows with --surface, the nearest stable
      // stand-in for the gradient behind it.
      className="rounded-card"
      style={{
        width: '100%',
        height,
        // Let the tooltip foreignObject paint outside the viewBox bounds so its
        // bottom border and shadow are not clipped by the SVG edge when the box
        // lands near the chart bottom.
        overflow: 'visible',
        // pan-y lets a vertical swipe scroll the page BEFORE the tooltip is
        // activated. After activation, the non-passive touchmove listener in
        // useScrub calls preventDefault to suppress scroll (touch-action can't
        // be changed mid-gesture, so it is NOT the mechanism that holds the scrub).
        touchAction: 'pan-y',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
      role="img"
      {...handlers}
    >
      {/* Горизонтальная сетка по Y-тикам (под графиком) + подписи значений слева. */}
      {yTicks.map((v, i) => (
        <g key={`yt-${i}`}>
          <line
            data-grid
            x1={PAD.left}
            x2={viewW - PAD.right}
            y1={yOf(v)}
            y2={yOf(v)}
            stroke="var(--color-line)"
            strokeWidth={1}
          />
          <text x={4} y={yOf(v) + 3} fontSize={9} fill="var(--color-muted)">
            {formatTick(v)}
          </text>
        </g>
      ))}
      {/* Подписи дат по X (до 5, равномерно). */}
      {xLabelIdx.map((i) => {
        const isFirst = i === 0;
        const isLast = i === dates.length - 1;
        const anchor = isFirst ? 'start' : isLast ? 'end' : 'middle';
        return (
          <text
            key={`xt-${i}`}
            x={xOf(dates[i])}
            y={height - PAD.bottom + 14}
            fontSize={9}
            fill="var(--color-muted)"
            textAnchor={anchor}
          >
            {formatDateShort(dates[i])}
          </text>
        );
      })}
      {series.map((s, i) => (
        <g key={s.id}>
          <polyline
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            // Dash/shape only once there is something to tell apart: on a
            // single-series chart the second channel carries no information
            // and a dashed line is simply harder to read than a solid one.
            strokeDasharray={decorate ? dashFor(i) : undefined}
            points={s.points.map((p) => `${xOf(p.date)},${yOf(p.value)}`).join(' ')}
          />
          {s.points.map((p) => (
            <Marker
              key={p.date}
              shape={decorate ? shapeFor(i) : 'circle'}
              cx={xOf(p.date)}
              cy={yOf(p.value)}
              r={3}
              fill={s.color}
            />
          ))}
        </g>
      ))}
      {activeIdx !== null && dates[activeIdx] !== undefined && (
        <>
          <line
            data-cursor
            x1={xOf(dates[activeIdx])}
            x2={xOf(dates[activeIdx])}
            y1={PAD.top}
            y2={height - PAD.bottom}
            stroke="var(--color-muted)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          {series.map((s, i) => {
            const p = s.points.find((pt) => pt.date === dates[activeIdx]);
            if (!p) return null;
            return (
              <Marker
                key={`c-${s.id}`}
                shape={decorate ? shapeFor(i) : 'circle'}
                cx={xOf(p.date)}
                cy={yOf(p.value)}
                r={5}
                fill={s.color}
                // Halo keeping the enlarged active marker readable where lines
                // overlap. --surface rather than --card now that the plot is
                // transparent over the page gradient.
                stroke="var(--color-surface)"
                strokeWidth={2}
              />
            );
          })}
          <ChartTooltip
            activeDate={dates[activeIdx]}
            series={series}
            decorate={decorate}
            xOf={xOf}
            yOf={yOf}
            viewW={viewW}
          />
        </>
      )}
    </svg>
  );

  // Standing legend under the plot (Figma 771:1772 / 852:2101): a labelled key
  // is what makes the colour+shape+dash encoding decodable at all — without it
  // the reader can tell the lines apart but not say which is which. Rendered
  // only when the series carry labels and there is more than one, matching the
  // mock (single-series cards there show no legend).
  const legendItems = decorate ? series.filter((s) => s.label) : [];

  if (legendItems.length === 0) return chart;

  return (
    <div className="flex flex-col gap-1">
      {chart}
      <ul className="m-0 flex list-none flex-wrap justify-center gap-x-4 gap-y-1 p-0">
        {series.map((s, i) =>
          s.label ? (
            <li key={`lg-${s.id}`} className="flex items-center gap-1.5">
              <SeriesSwatch color={s.color} shape={shapeFor(i)} dash={dashFor(i)} />
              {/* The mock colours the legend label with the series hue, but
                  that only works on the dark card it was drawn on: the series
                  palette is tuned for lines, and on the LIGHT --card (#F2F0EC)
                  chart-5 scores 1.27:1 and chart-3 1.76:1 — illegible. The
                  colour lives in the swatch (where contrast is not a text
                  requirement) and the label stays --content, readable in both
                  themes. */}
              <span className="text-label text-content">{s.label}</span>
            </li>
          ) : null,
        )}
      </ul>
    </div>
  );
}
