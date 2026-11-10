import type { components } from '@/shared/api/schema';
import { altRail, outlineCard } from '@/pages/programs/ui/program-ui';
import { volumeLabel } from '@/shared/lib/format/plural';
import { Icon } from '@/shared/ui/primitives';
import { alertCircleOutline } from '@/shared/ui/icons';

type SlotExerciseOut = components['schemas']['SlotExerciseOut'];

/** Подпись под названием упражнения (Figma 932:1983): «N подходов × M повторений». */
function volume(e: SlotExerciseOut) {
  return volumeLabel(e.sets, e.reps);
}

function Contraindications() {
  return (
    <span className="flex items-center gap-1 text-caption text-danger">
      <Icon icon={alertCircleOutline} style={{ fontSize: 12 }} />
      Есть противопоказания
    </span>
  );
}

/**
 * Карточка слота программы: основное упражнение плюс альтернативы под ним.
 * Одна и та же форма в 932:1969 (просмотр программы) и 1006:2031 (выбор дня),
 * поэтому живёт отдельным компонентом, а не дублируется по экранам.
 *
 * Альтернатива отделяется вертикальной полосой цвета серии 4 и префиксом
 * «Альт.» тем же цветом — цвет не единственный признак, есть и текст.
 */
export function ExerciseRow({ exercises }: { exercises: SlotExerciseOut[] }) {
  const primary = exercises.find((e) => e.variant_order === 0) ?? exercises[0];
  if (!primary) return null;
  const alternatives = exercises.filter((e) => e.id !== primary.id);

  return (
    <div className={`${outlineCard} flex flex-col gap-[15px]`}>
      <div className="flex flex-col gap-[5px]">
        <span className="text-body-m text-content">{primary.name}</span>
        <span className="text-caption text-content">{volume(primary)}</span>
        {primary.has_contraindications && <Contraindications />}
      </div>

      {alternatives.map((alt) => (
        <div key={alt.id} className={`${altRail} flex flex-col gap-[5px]`}>
          <span className="flex items-center gap-[5px]">
            <span className="text-body-m text-chart-4-text">Альт.</span>
            <span className="text-body-m text-content">{alt.name}</span>
          </span>
          <span className="text-caption text-content">{volume(alt)}</span>
          {alt.has_contraindications && <Contraindications />}
        </div>
      ))}
    </div>
  );
}
