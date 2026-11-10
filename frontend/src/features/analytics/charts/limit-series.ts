import type { components } from '@/shared/api/schema';
type Parameter = components['schemas']['ParameterSeries'];
type Exercise = components['schemas']['ExerciseSeries'];
const round = (v: number) => Math.round(v * 10) / 10;
function average(values: number[]) {
  return values.length ? round(values.reduce((a, b) => a + b, 0) / values.length) : null;
}
export function limitParameter(series: Parameter, from: string): Parameter {
  const points = series.points.filter((p) => p.date >= from);
  if (points.length === series.points.length) return series;
  const values = points.map((p) => p.value);
  return {
    ...series,
    points,
    stats: {
      min: values.length ? Math.min(...values) : 0,
      max: values.length ? Math.max(...values) : 0,
      avg: average(values) ?? 0,
      change_percent:
        values.length > 1 && values[0] !== 0
          ? round(((values[values.length - 1] - values[0]) / Math.abs(values[0])) * 100)
          : 0,
    },
  };
}
export function limitExercise(series: Exercise, from: string): Exercise {
  const points = series.points.filter((p) => p.date >= from);
  if (points.length === series.points.length) return series;
  return {
    ...series,
    points,
    stats: {
      avg_weight: average(points.flatMap((p) => (p.weight == null ? [] : [p.weight]))),
      avg_reps: average(points.flatMap((p) => (p.reps == null ? [] : [p.reps]))),
      total_workouts: points.reduce((n, p) => n + (p.session_count ?? 1), 0),
    },
  };
}
