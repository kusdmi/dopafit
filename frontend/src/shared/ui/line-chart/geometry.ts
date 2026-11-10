import type { ChartSeries } from './types';

export const PAD = { top: 12, right: 12, bottom: 22, left: 34 };
// Дефолтная ширина viewBox для первого рендера и jsdom (где измерение даёт 0).
// На клиенте VIEW_W подменяется на фактическую ширину контейнера, поэтому
// масштаб остаётся 1:1 (1 единица viewBox = 1 px) и линии/точки/текст не искажаются.
export const DEFAULT_VIEW_W = 320;
const TICK_COUNT = 4; // → 5 уровней по оси Y (0..4)
const MAX_X_LABELS = 6;
// При числе точек до этого порога показываем все даты (на дашборде замеров 6 точек),
// иначе — равномерная выборка не более MAX_X_LABELS подписей, чтобы они не наезжали.
const X_LABELS_SHOW_ALL = 7;

export interface ChartGeometry {
  hasData: boolean;
  dates: string[];
  xOf: (date: string) => number;
  yOf: (value: number) => number;
  yTicks: number[];
  formatTick: (value: number) => string;
  xLabelIdx: number[];
}

/**
 * Статическая геометрия графика: шкалы, тики и выборка подписей по X.
 *
 * Зависит только от данных и размеров области, поэтому вынесена в чистую
 * функцию и мемоизируется в LineChart: скраб пальцем меняет лишь активный
 * индекс на 60–120 Гц и не должен пересчитывать шкалы каждый кадр. Индекс даты
 * держим в Map — иначе `indexOf` на точку давал бы O(n²) на отрисовке серий.
 */
export function computeGeometry(
  series: ChartSeries[],
  viewW: number,
  height: number,
): ChartGeometry {
  const allPoints = series.flatMap((s) => s.points);
  const dates = Array.from(new Set(allPoints.map((p) => p.date))).sort();
  const dateIndex = new Map(dates.map((d, i) => [d, i]));
  const values = allPoints.map((p) => p.value);
  // Масштаб по фактическим значениям серий (без принудительного 0), чтобы линия
  // занимала основную область графика и центрировалась. Паддинг ~15% диапазона.
  const rawMin = values.length ? Math.min(...values) : 0;
  const rawMax = values.length ? Math.max(...values) : 1;
  const span = rawMax - rawMin || 1;
  const padV = span * 0.15;
  const minV = rawMin - padV;
  const maxV = rawMax + padV;
  const plotW = viewW - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const denomX = Math.max(dates.length - 1, 1);
  const denomY = maxV - minV || 1;
  const xOf = (date: string) => PAD.left + (plotW * (dateIndex.get(date) ?? 0)) / denomX;
  const yOf = (value: number) => PAD.top + plotH - (plotH * (value - minV)) / denomY;

  // Равномерные тики по Y между rawMin и rawMax (включительно).
  const yTicks = Array.from(
    { length: TICK_COUNT + 1 },
    (_, i) => rawMin + ((rawMax - rawMin) * i) / TICK_COUNT,
  );
  // Если диапазон мал — показываем 1 знак после запятой, иначе целые.
  const tickSpan = rawMax - rawMin;
  const formatTick = (v: number) => (tickSpan < TICK_COUNT ? v.toFixed(1) : String(Math.round(v)));

  // Индексы дат для подписей по X: до MAX_X_LABELS равномерно (первая, последняя, промежуточные).
  const n = dates.length;
  let xLabelIdx: number[];
  if (n <= 1) {
    xLabelIdx = n === 1 ? [0] : [];
  } else if (n <= X_LABELS_SHOW_ALL) {
    xLabelIdx = Array.from({ length: n }, (_, i) => i);
  } else {
    const set = new Set<number>();
    for (let i = 0; i < MAX_X_LABELS; i += 1) {
      set.add(Math.round(((n - 1) * i) / (MAX_X_LABELS - 1)));
    }
    xLabelIdx = Array.from(set).sort((a, b) => a - b);
  }

  return { hasData: allPoints.length > 0, dates, xOf, yOf, yTicks, formatTick, xLabelIdx };
}
