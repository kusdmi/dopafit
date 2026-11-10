import { PremiumNotice } from '@/shared/ui/PremiumNotice';
import { RestTimer } from '@/features/workout/rest-timer/RestTimer';
import { informationCircleOutline } from '@/shared/ui/icons';
import { Icon } from '@/shared/ui/primitives';

interface Props {
  premium?: boolean | null;
  reps: number;
  plannedSets: number;
  doneSets: number;
  /** Момент последнего подхода — с него идёт отсчёт отдыха; null = подходов ещё нет. */
  lastSetAt: string | null;
  onExplainTimer: () => void;
}

/** Три показателя в ряд: план повторений, таймер отдыха и счётчик подходов. */
export function WorkoutStatsRow({
  premium = true,
  reps,
  plannedSets,
  doneSets,
  lastSetAt,
  onExplainTimer,
}: Props) {
  const columns = [
    { key: 'reps', label: 'Повторения', value: <>{reps}</> },
    {
      key: 'timer',
      label: lastSetAt ? 'Отдых' : 'Таймер',
      value:
        premium === null ? (
          <>—</>
        ) : premium ? (
          lastSetAt ? (
            <RestTimer lastSetAt={lastSetAt} />
          ) : (
            <>—</>
          )
        ) : (
          <PremiumNotice
            badgeOnly
            compact
            title="Таймер отдыха"
            description="Таймер отдыха доступен с Premium. Он показывает время с последнего записанного подхода."
          />
        ),
    },
    {
      key: 'sets',
      label: 'Подходов',
      value: (
        <>
          {/* Счётчик выполненного подсвечивается успехом, как в макете. */}
          <span className={doneSets > 0 ? 'text-success' : ''}>{doneSets}</span>/{plannedSets}
        </>
      ),
    },
  ];

  return (
    // Ряд держат равная основа колонок (basis-0) и однострочные подписи равной
    // высоты. `items-center` центрирует колонки в секции: при `items-stretch`
    // они растягивались бы на всю её высоту, прижимая содержимое к верхней кромке.
    <section className="flex items-center rounded-[14px] border border-line p-[15px]">
      {columns.map(({ key, label, value }) => (
        <div key={key} className="flex flex-1 basis-0 flex-col items-center gap-1">
          {/* Бокс подписи равен своей строке — без запаса под вторую: подписи
              короткие («Повторения» — самая широкая, 64px) и в колонку 103px
              при 390px укладываются в одну строку. Перенос не начинается даже
              при ширине секции 190px, то есть уже любого реального экрана. */}
          <span className="flex text-center text-caption text-muted">
            {/* relative на самой СТРОКЕ текста, а не на внешнем боксе подписи:
                якорь от бокса уводил иконку вверх, пока тот был выше текста
                (замерено −7.5px от середины слова). Точка отсчёта — строка,
                поэтому top-1/2 означает её собственную середину и держится,
                как бы ни менялся бокс вокруг. */}
            <span className="relative">
              {label}
              {/* Кнопка ⓘ объясняет ИМЕННО таймер отдыха, поэтому стоит при его
                  подписи, а не в углу секции.

                  Вне потока (absolute): в потоке колонка центрировала бы «Отдых»
                  ВМЕСТЕ с иконкой и слово уезжало бы влево на половину от
                  «иконка + отступ». Точка отсчёта — сама подпись, поэтому
                  left-full + ml-1.5 ставит иконку в 6px правее последней буквы
                  независимо от того, «Отдых» это или «Таймер».

                  Размер иконки взят от подписи: подпись набрана ролью
                  text-caption, это 11px, иконка 12px (109%) держится чуть выше
                  строчной высоты — различима как цель, но не спорит с подписью.
                  Ниже 12px опускаться нельзя: окружность с «i» внутри — рисунок
                  из трёх деталей, на 11px и меньше он замыливается.

                  Тап-цель 44px (a11y) больше иконки 12px и вынесена в ::after,
                  так что видимый бокс равен иконке и ничего не смещает. Центр
                  у ::after свой: при центрировании по иконке зона 44px уходила
                  бы левым краем ПОД слово и тап по хвосту «Отдых» открывал бы
                  подсказку. Поэтому ::after сдвинут на +10px вправо от центра
                  иконки: центр иконки стоит в 12px от буквы, центр зоны — в
                  22px, и её левый край ложится ровно на правую кромку текста. */}
              {key === 'timer' && premium && (
                <button
                  type="button"
                  aria-label="Как работает таймер отдыха"
                  onClick={onExplainTimer}
                  className="absolute left-full top-1/2 ml-1.5 flex size-[12px] -translate-y-1/2 items-center justify-center text-muted after:absolute after:left-[calc(50%+10px)] after:top-1/2 after:size-[44px] after:-translate-x-1/2 after:-translate-y-1/2 after:content-['']"
                >
                  <Icon
                    icon={informationCircleOutline}
                    aria-hidden="true"
                    style={{ fontSize: 12 }}
                  />
                </button>
              )}
            </span>
          </span>
          {/* Значение — бокс фиксированной высоты с выключкой по центру, чтобы
              цифры трёх колонок стояли на одной линии независимо от того, что
              внутри: обычный текст в крайних, вложенный <span> таймера в
              средней. */}
          <span className="text-stat-s flex min-h-[44px] items-center justify-center tabular-nums leading-none text-content">
            {value}
          </span>
        </div>
      ))}
    </section>
  );
}
