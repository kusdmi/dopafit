import { ExercisePicker } from '@/entities/exercise/ui/ExercisePicker';
import { useProgram } from '@/entities/program/api/use-program';
import { usePrograms } from '@/entities/program/api/use-programs';
import { Select } from '@/shared/ui/Select';

import { METRIC_META } from '../config/meta';
import { ToggleGroup } from '../ToggleGroup';
import { DateRangeField } from './DateRangeField';
import type { AnalyticsView, WorkoutView } from './useAnalyticsView';

interface Props {
  view: AnalyticsView;
  patch: (next: Partial<AnalyticsView>) => void;
}

/**
 * The «Тренировки» controls (Figma 768:1058 / 784:1093): view mode, period,
 * then either program+day or a single exercise, then the compared metric.
 */
export function WorkoutControls({ view, patch }: Props) {
  const programs = usePrograms();
  const program = useProgram(view.programId || null);

  return (
    <>
      <ToggleGroup
        label="Режим просмотра"
        value={view.workoutView}
        onChange={(v: WorkoutView) => patch({ workoutView: v })}
        options={[
          { value: 'program', label: 'По программе/дню' },
          { value: 'exercise', label: 'По упражнению' },
        ]}
      />

      <DateRangeField label="Дата" dateFrom={view.dateFrom} dateTo={view.dateTo} onChange={patch} />

      {view.workoutView === 'program' ? (
        <div className="flex flex-wrap gap-4">
          <Select
            className="min-w-0 flex-1"
            label="Программа тренировки"
            value={view.programId}
            // Смена программы обнуляет день: id дня принадлежит прежней
            // программе и в новой не существует.
            onChange={(e) => patch({ programId: e.target.value, dayId: '' })}
          >
            <option value="">Все программы</option>
            {(programs.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          {view.programId !== '' && (
            <Select
              className="min-w-0 flex-1"
              label="День программы"
              value={view.dayId}
              onChange={(e) => patch({ dayId: e.target.value })}
            >
              <option value="">Все дни</option>
              {(program.data?.days ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          )}
        </div>
      ) : (
        <ExercisePicker value={view.exerciseId} onChange={(exerciseId) => patch({ exerciseId })} />
      )}

      <ToggleGroup
        label="Значения для сравнения"
        value={view.metric}
        onChange={(m) => patch({ metric: m })}
        options={METRIC_META.map((m) => ({ value: m.id, label: m.label }))}
      />
    </>
  );
}
