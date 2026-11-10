import type { components } from '@/shared/api/schema';
import { chevronDown } from '@/shared/ui/icons';
import { Icon } from '@/shared/ui/primitives';
import type { ActiveSession } from '@/entities/workout/model/types';
import { ExerciseHistoryList } from '@/pages/programs/exercise-history-list/ExerciseHistoryList';

type ExerciseHistoryDay = components['schemas']['ExerciseHistoryDay'];
type LoggedSet = ActiveSession['sets'][number];

interface Props {
  open: boolean;
  onToggle: () => void;
  /** Подходы, записанные в этой сессии (их можно открыть на редактирование). */
  currentSets: LoggedSet[];
  historyLoading: boolean;
  historyDays: ExerciseHistoryDay[];
  onSelectSet: (setId: string) => void;
}

/** «История выполнения» на обводке серии 4, заголовок тем же цветом. */
export function WorkoutHistorySection({
  open,
  onToggle,
  currentSets,
  historyLoading,
  historyDays,
  onSelectSet,
}: Props) {
  return (
    <section className="rounded-[14px] border border-chart-4-text p-[15px]">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full items-center justify-center gap-2 text-h3 text-chart-4-text"
      >
        История выполнения
        <Icon
          icon={chevronDown}
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
          style={{ fontSize: 20 }}
        />
      </button>
      {open && (
        <div className="flex flex-col gap-[15px] pt-[15px]">
          {currentSets.length > 0 && (
            <div className="flex flex-col gap-[5px]">
              {/* Подзаголовок группы — приглушённый, как и парный ему
                  «Прошлые тренировки» ниже. Фиолетовый здесь был третьим
                  уровнем подряд (обводка карточки → её заголовок → эта
                  подпись), из-за чего цвет переставал что-либо выделять, а две
                  равноправные группы внутри карточки выглядели разными по
                  рангу. Принадлежность к карточке держат её обводка и
                  заголовок; группы различают текст подписей. */}
              <p className="m-0 text-center text-caption text-muted">Эта тренировка</p>
              <ul className="flex list-none flex-col gap-[5px] p-0">
                {currentSets.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => onSelectSet(s.id)}
                      className="flex w-full items-center justify-between gap-3 rounded-[14px] bg-card-light px-[15px] py-[8px] text-caption text-content"
                    >
                      {/* Сам подход — то, ради чего открывают историю, поэтому
                          вес и повторы идут ролью Body M, а не Caption. Время
                          остаётся Caption приглушённым. */}
                      <span className="text-body-m tabular-nums">
                        {s.weight} кг × {s.reps}
                      </span>
                      {/* `text-muted` на `card-light` даёт 3.35:1 в тёмной теме
                          (известное ограничение шкалы — «muted только на
                          surface/card»). Внутри залитой строки время берёт
                          обычный `content` с пониженной непрозрачностью: тот же
                          тише-основного эффект, но 9.42:1 в тёмной теме и
                          13.02:1 в светлой до применения альфы. */}
                      <span className="text-content/70">
                        {new Date(s.performedAt).toLocaleTimeString('ru-RU', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {/* Пустое состояние прошлых тренировок показываем, только когда в
              этой сессии тоже пусто: иначе «Пока нет записей» стоит прямо под
              записанным подходом и читается как противоречие. Когда записи
              прошлых дней есть, их группа получает собственный заголовок —
              без него даты сливаются с блоком текущей тренировки. */}
          {historyLoading ? (
            <p className="text-body-s text-muted">Загрузка…</p>
          ) : historyDays.length > 0 ? (
            <div className="flex flex-col gap-[5px]">
              <p className="m-0 text-center text-caption text-muted">Прошлые тренировки</p>
              <ExerciseHistoryList days={historyDays} onSelect={onSelectSet} />
            </div>
          ) : currentSets.length === 0 ? (
            <p className="text-center text-body-s text-muted">Пока нет записей</p>
          ) : null}
        </div>
      )}
    </section>
  );
}
