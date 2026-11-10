export interface DayMarker {
  date: string;
  personal: boolean;
  client: boolean;
}

interface Props {
  days: DayMarker[];
  onOpen: () => void;
}

const WEEKDAY_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

const MONTHS_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function WeekStrip({ days, onOpen }: Props) {
  const now = new Date();
  const today = isoOf(now);
  // Monday-first start of the current week.
  const offsetToMonday = (now.getDay() + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - offsetToMonday);

  const markerByDate = new Map(days.map((m) => [m.date, m]));

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });

  return (
    // Figma 392:2058: the calendar is a bare section on the page gradient — no
    // card plate. A heading row carries the title and today's date, and the
    // strip below it is the tappable affordance into the full calendar.
    <section className="flex flex-col gap-[15px]">
      <div className="flex items-center justify-between">
        <h2 className="text-h1 text-content">Календарь</h2>
        <span className="text-h2 text-content">
          {now.getDate()} {MONTHS_GENITIVE[now.getMonth()]}
        </span>
      </div>
      <button
        type="button"
        onClick={onOpen}
        aria-label="Открыть календарь"
        className="grid grid-cols-7 gap-[5px]"
      >
        {weekDays.map((d) => {
          const iso = isoOf(d);
          const isToday = iso === today;
          const marker = markerByDate.get(iso);
          return (
            // Figma 392:2063 "day cell": radius 15, today on the accent fill.
            // Width is left to the 7-column grid so the strip fits any screen
            // instead of Figma's fixed 47px.
            //
            // 58px instead of the mock's 69px: at 7 columns the cell is ~47px
            // wide, so a 69px block reads as a tall bar rather than a date.
            // 58px is nearer square and still clears the 44px tap target.
            //
            // The six non-today cells keep a plate, but a very quiet one
            // (card-light at 40%) rather than the mock's full-strength fill on
            // every day: the plate draws the column so the seven read as one
            // row, while staying far below the accent of today's cell.
            <div
              key={iso}
              data-iso={iso}
              data-today={isToday ? '' : undefined}
              className={`flex h-[58px] flex-col items-center justify-center gap-[2px] rounded-[15px] ${
                isToday ? 'bg-brand-400' : 'bg-card-light/40'
              }`}
            >
              {/* Тип на заливке — ФИКСИРОВАННЫЙ светлый, как во ВСЕХ остальных
                  местах проекта на акценте: chart-1-fg (алиас neutral-50) в
                  SessionTabs, CurrentExerciseCard, ClientPicker, на кнопке
                  `.action-button--solid` (--color-logo-fg). Тематический
                  `--content` здесь не годится: он переворачивается вместе с
                  темой, хотя заливка в обеих темах одна.

                  Тёмный neutral-900 формально даёт на #FF7003 больше (6.62:1
                  против 2.65:1), но тёмный тон на насыщенном оранжевом
                  воспринимается грязно. Пара «светлый текст на акценте» —
                  задокументированное решение дизайнера (design-system.md,
                  «Известные ограничения контраста»). */}
              <span className={`text-body-m ${isToday ? 'text-chart-1-fg' : 'text-content'}`}>
                {WEEKDAY_SHORT[d.getDay()]}
              </span>
              {/* The mock sets the day number in 14px Bold — a weight the role
                  scale has no token for. H3 (16px SemiBold) is the nearest role
                  and keeps the number emphasised over the weekday above it. */}
              <span className={`text-h3 ${isToday ? 'text-chart-1-fg' : 'text-content'}`}>
                {pad(d.getDate())}
              </span>
              {/* Отступ сверху и увеличенный зазор между точками: обводка на
                  сегодняшней ячейке делает точку визуально шире её 6px, и без
                  воздуха она липнет к числу, а две точки — друг к другу. */}
              <span className="mt-[3px] flex h-[6px] items-center justify-center gap-[3px]">
                {/* Точка СОХРАНЯЕТ свой оттенок и на сегодняшней заливке (узел
                    392:5206: заливка #FF7003 — тот же brand-400, что и ячейка),
                    а читаемой её делает светлая обводка brand-50 #FFF0E6.
                    Раньше точки вместо этого перекрашивались в нейтральные
                    (белую и почти чёрную) — на оранжевой ячейке личная
                    тренировка переставала быть оранжевой, то есть теряла ровно
                    тот признак, по которому её узнают на остальных днях.
                    Обводка решает ту же задачу контраста (brand на brand 1:1),
                    не трогая цвет-смысл. Вне сегодняшней ячейки обводка не
                    нужна: оттенки и так читаемы. */}
                {marker?.personal && (
                  <span
                    data-marker="personal"
                    aria-hidden="true"
                    className={`block size-[6px] rounded-full bg-brand-400 ${
                      isToday ? 'ring-1 ring-brand-50' : ''
                    }`}
                  />
                )}
                {marker?.client && (
                  <span
                    data-marker="client"
                    aria-hidden="true"
                    className={`block size-[6px] rounded-full bg-trainer-500 ${
                      isToday ? 'ring-1 ring-brand-50' : ''
                    }`}
                  />
                )}
              </span>
            </div>
          );
        })}
      </button>
    </section>
  );
}
