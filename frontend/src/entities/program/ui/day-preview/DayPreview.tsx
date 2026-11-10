import type { components } from '@/shared/api/schema';

type DayOut = components['schemas']['DayOut'];

export function DayPreview({ day }: { day: DayOut }) {
  return (
    <ul className="space-y-2">
      {day.slots.map((slot, i) => {
        const primary = slot.exercises.find((e) => e.variant_order === 0) ?? slot.exercises[0];
        if (!primary) return null;
        const alts = slot.exercises.length - 1;
        return (
          <li key={slot.id} className="rounded-lg border border-line bg-card p-3">
            <p className="text-content">
              {i + 1}. {primary.name} — {primary.sets}×{primary.reps}
            </p>
            <div className="text-label mt-1 flex gap-2">
              {alts > 0 && <span className="text-muted">Альтернатив: {alts}</span>}
              {primary.has_contraindications && (
                <span className="text-danger"><span aria-hidden="true">⚠ </span>Противопоказания</span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
