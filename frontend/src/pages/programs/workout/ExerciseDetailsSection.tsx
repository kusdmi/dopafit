import { ExerciseMedia } from '@/entities/exercise/ui/ExerciseMedia';
import { chevronDown } from '@/shared/ui/icons';
import { Icon } from '@/shared/ui/primitives';
import type { components } from '@/shared/api/schema';

type ExerciseOut = components['schemas']['ExerciseOut'];

interface Props {
  open: boolean;
  onToggle: () => void;
  /** null — упражнение пользовательское, описания у него нет. */
  exerciseId: string | null;
  isLoading: boolean;
  isError: boolean;
  data: ExerciseOut | undefined;
}

/** «Детали упражнения» — раскрывающаяся карточка на обводке акцента. */
export function ExerciseDetailsSection({
  open,
  onToggle,
  exerciseId,
  isLoading,
  isError,
  data,
}: Props) {
  return (
    <section className="rounded-[14px] border border-brand-400 p-[15px]">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 text-h3 text-brand-text"
      >
        Детали упражнения
        <Icon
          icon={chevronDown}
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
          style={{ fontSize: 20 }}
        />
      </button>
      {open && (
        <div className="pt-[15px]">
          {exerciseId === null ? (
            <p className="text-body-s text-muted">Своё упражнение — нет описания.</p>
          ) : isLoading ? (
            <p className="text-body-s text-muted">Загрузка…</p>
          ) : isError ? (
            <p className="text-body-s text-danger">Не удалось загрузить детали</p>
          ) : data ? (
            <div className="flex flex-col gap-[15px]">
              <ExerciseMedia media={data.media} imageUrl={data.image_url} />
              {/* Без подзаголовка «Описание упражнения»: карточка уже названа
                  «Детали упражнения», и абзац под ней — очевидно описание.
                  Подпись повторяла заголовок над собой и только добавляла
                  строку между ним и текстом. */}
              {data.description && (
                <p className="m-0 text-body-s text-content">{data.description}</p>
              )}
              {data.steps.length > 0 && (
                <ol className="flex list-none flex-col gap-2 p-0">
                  {data.steps.map((step, i) => (
                    // items-center: кружок с номером — 24px, текст шага — 13px.
                    // По умолчанию flex тянет оба к верхней кромке строки, и
                    // цифра вставала заметно выше своего текста.
                    <li key={i} className="flex items-center gap-2 text-body-s text-content">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-400 text-caption text-chart-1-fg">
                        {i + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
