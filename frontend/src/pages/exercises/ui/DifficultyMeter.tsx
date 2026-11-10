import { DIFFICULTY_CLASS, DIFFICULTY_LABEL } from '@/entities/exercise/model/difficulty';
import type { components } from '@/shared/api/schema';

type Difficulty = components['schemas']['Difficulty'];

// Шкала сложности: три сегмента, закрашено столько, какова ступень. Цвет
// закрашенных совпадает с цветом подписи, поэтому уровень читается и без
// цвета — по числу делений.
const DIFFICULTY_STEPS: Record<Difficulty, number> = {
  beginner: 1,
  intermediate: 2,
  advanced: 3,
};

const DIFFICULTY_FILL: Record<Difficulty, string> = {
  beginner: 'bg-success-fill',
  intermediate: 'bg-info-fill',
  advanced: 'bg-danger-fill',
};

export function DifficultyMeter({ difficulty }: { difficulty: Difficulty }) {
  const filled = DIFFICULTY_STEPS[difficulty];
  return (
    <div className="flex items-center gap-[5px]">
      <span className="flex flex-1 items-center gap-[5px]" aria-hidden="true">
        {[1, 2, 3].map((step) => (
          <span
            key={step}
            className={`h-[8px] flex-1 rounded-[25px] ${
              step <= filled ? DIFFICULTY_FILL[difficulty] : 'bg-card-light'
            }`}
          />
        ))}
      </span>
      <span className={`shrink-0 text-h3 ${DIFFICULTY_CLASS[difficulty]}`}>
        {DIFFICULTY_LABEL[difficulty]}
      </span>
    </div>
  );
}
