import type { components } from '@/shared/api/schema';
import { formatHistoryDate } from '@/shared/lib/time/formatDate';

type ExerciseHistoryDay = components['schemas']['ExerciseHistoryDay'];

interface ExerciseHistoryListProps {
  days: ExerciseHistoryDay[];
  onSelect?: (setId: string) => void;
}

export function ExerciseHistoryList({ days, onSelect }: ExerciseHistoryListProps) {
  if (days.length === 0) {
    return <p className="text-body-s text-muted">Пока нет записей</p>;
  }
  return (
    <div className="space-y-3">
      {days.map((day) => (
        <div key={day.date}>
          <p className="mb-1 text-center text-caption text-chart-4-text">{formatHistoryDate(day.date)}</p>
          <ul className="space-y-1">
            {day.entries.map((e) => (
              <li key={e.set_id}>
                <button
                  type="button"
                  onClick={() => onSelect?.(e.set_id)}
                  className="flex w-full justify-between gap-3 rounded-[14px] bg-card-light px-[15px] py-[6px] text-caption text-content"
                >
                  <span>
                    {e.weight} кг × {e.reps}
                  </span>
                  <span className="text-muted">
                    {new Date(e.performed_at).toLocaleTimeString('ru-RU', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
