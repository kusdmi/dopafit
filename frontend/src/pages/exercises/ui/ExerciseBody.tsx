import type { components } from '@/shared/api/schema';

type ExerciseOut = components['schemas']['ExerciseOut'];

// Заголовок секции — H2 (962:2048/962:2058). Это <h2>: единственный <h1> на
// странице живёт в шапке (design-system.md «Шапка на градиентных экранах»).
function SectionTitle({ children }: { children: string }) {
  return <h2 className="text-h2 text-content">{children}</h2>;
}

/** Описание, пошаговая инструкция и примечание — текстовая часть карточки. */
export function ExerciseBody({ exercise }: { exercise: ExerciseOut }) {
  return (
    <>
      {exercise.description && (
        <div className="flex flex-col gap-[10px]">
          <SectionTitle>Описание упражнения</SectionTitle>
          <p className="text-body-m leading-relaxed text-content">{exercise.description}</p>
        </div>
      )}

      {exercise.steps.length > 0 && (
        <div className="flex flex-col gap-[10px]">
          <SectionTitle>Как выполнять</SectionTitle>
          <ol className="flex flex-col gap-[10px]">
            {exercise.steps.map((step, i) => (
              <li key={i} className="flex items-center gap-[10px]">
                <span
                  aria-hidden="true"
                  className="flex size-[40px] shrink-0 items-center justify-center rounded-[14px] bg-brand-400 text-h2 text-neutral-50"
                >
                  {i + 1}
                </span>
                <span className="text-body-m leading-relaxed text-content">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Противопоказания (968:1849): карточка на --card с обводкой и
          заголовком цветом «инфо» — предупреждение, а не ошибка. */}
      {exercise.contraindications && (
        <div className="flex flex-col gap-[10px] rounded-[14px] border border-info-fill bg-card p-[15px]">
          <h2 className="text-h2 text-info">Примечание</h2>
          <p className="text-body-m leading-relaxed text-content">{exercise.contraindications}</p>
        </div>
      )}
    </>
  );
}
