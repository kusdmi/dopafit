import { workoutVariants } from './variants';
import type { LocalSet, WorkoutSlot } from './types';

export interface LocalExerciseSummary {
  name: string;
  max: number;
  avg: number;
  min: number;
}

export interface LocalSummary {
  durationSeconds: number;
  avgRestSeconds: number | null;
  exercises: LocalExerciseSummary[];
}

interface Args {
  startedAt: string;
  finishedAt: string;
  slots: WorkoutSlot[];
  sets: LocalSet[];
}

export function computeLocalSummary({ startedAt, finishedAt, slots, sets }: Args): LocalSummary {
  const durationSeconds = Math.round(
    (new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000,
  );
  const ordered = [...sets].sort(
    (a, b) => new Date(a.performedAt).getTime() - new Date(b.performedAt).getTime(),
  );
  let avgRestSeconds: number | null = null;
  if (ordered.length >= 2) {
    const gaps: number[] = [];
    for (let i = 1; i < ordered.length; i += 1) {
      gaps.push(
        (new Date(ordered[i].performedAt).getTime() -
          new Date(ordered[i - 1].performedAt).getTime()) /
          1000,
      );
    }
    avgRestSeconds = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
  }
  const nameByVariant = new Map(
    slots.flatMap((slot) => workoutVariants(slot, sets).map((v) => [v.variantId, v.name] as const)),
  );
  const byVariant = new Map<string, number[]>();
  for (const s of sets) {
    const list = byVariant.get(s.variantId) ?? [];
    list.push(s.weight);
    byVariant.set(s.variantId, list);
  }
  const exercises: LocalExerciseSummary[] = [];
  for (const [variantId, weights] of byVariant) {
    exercises.push({
      name: nameByVariant.get(variantId) ?? '',
      max: Math.max(...weights),
      avg: Math.round((weights.reduce((a, b) => a + b, 0) / weights.length) * 100) / 100,
      min: Math.min(...weights),
    });
  }
  return { durationSeconds, avgRestSeconds, exercises };
}
