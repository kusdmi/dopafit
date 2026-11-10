interface DayMarkers {
  hasPersonal: boolean;
  hasWithClients: boolean;
}

interface Props {
  year: number;
  month: number; // 1-12
  eventsByDay: Map<number, DayMarkers>;
  /** Сегодняшняя дата (ISO): прошедшие пустые дни не принимают запись. */
  today: string;
  onDayClick: (iso: string) => void;
}

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

// Ячейка календаря (design-system.md «Ячейка календаря», узел 392:2063 и сетка
// экрана 392:2856): фон нейтральный 600 (в тёмной теме = --card-light), радиус
// 15px. Радиус 15px задаётся точечно (не через rounded-card = 16px), как решено
// в design-system.md §«Радиусы» для мест, сверенных с конкретным узлом Figma.
//
// Высота фиксированная 44px, а не `aspect-square`: ширину ячейки задаёт сетка
// из семи колонок, и квадрат сделал бы высоту её заложницей — на 360px вышло бы
// 36px, то есть тап-цель провалилась бы ниже порога ровно там, где экран
// меньше. Прямая высота 44px держит порог на любой ширине.
const CELL_BASE = 'flex h-[44px] flex-col items-center justify-center rounded-[15px] text-body-m';

export function MonthGrid({ year, month, eventsByDay, today, onDayClick }: Props) {
  const daysInMonth = new Date(year, month, 0).getDate();
  // Monday-first index of the 1st day of the month (JS getDay() is Sunday-first).
  const firstWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7;

  const now = new Date();
  const isToday = (day: number) =>
    now.getFullYear() === year && now.getMonth() + 1 === month && now.getDate() === day;

  const leadingBlanks = Array.from({ length: firstWeekday }, (_, i) => i);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  return (
    <div className="flex flex-col gap-[15px]">
      <div className="grid grid-cols-7 gap-[5px] text-center text-body-m text-content">
        {WEEKDAYS.map((label) => (
          <div key={label} className="py-1">
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-[5px]">
        {leadingBlanks.map((i) => (
          <div key={`blank-${i}`} aria-hidden="true" />
        ))}
        {days.map((day) => {
          const iso = `${year}-${pad(month)}-${pad(day)}`;
          const markers = eventsByDay.get(day);
          const isCurrentDay = isToday(day);
          const hasEvents = markers !== undefined;
          // Прошедший ПУСТОЙ день записи не принимает (см. CalendarPage), и
          // ячейка это показывает, а не молча игнорирует тап: disabled снимает
          // её из обхода с клавиатуры и озвучивается скринридером. Прошедший
          // день С тренировками остаётся кликабельным — его карточку ещё
          // открывают, чтобы посмотреть или отменить невыполненный план.
          const isPastEmpty = iso < today && !hasEvents;
          return (
            <button
              key={day}
              type="button"
              onClick={() => onDayClick(iso)}
              disabled={isPastEmpty}
              {...(isCurrentDay ? { 'data-today': '' } : {})}
              className={`${CELL_BASE} ${
                isCurrentDay
                  ? 'bg-brand-400 text-neutral-50' // contrast text on brand fill
                  : 'bg-card-light text-content'
              } ${isPastEmpty ? 'opacity-40' : ''}`}
            >
              <span>{day}</span>
              {/* Отступ сверху и увеличенный зазор между точками: обводка на
                  сегодняшней ячейке делает точку визуально шире её 6px, и без
                  воздуха она липнет к числу, а две точки — друг к другу. */}
              <span className="mt-[3px] flex h-1.5 items-center gap-[3px]">
                {/* Точка КАЖДОГО дня держит свой цвет-смысл: личная — фиксированный
                    brand-400 (тот же оранжевый, что и акцент приложения),
                    клиентская — тематический trainer-text. На сегодняшней ячейке
                    фон тоже brand-400, поэтому личная точка на нём была бы 1:1;
                    читаемость возвращает светлая обводка brand-50 (#FFF0E6),
                    ровно как в макете (узел 392:5206), а не перекраска точки в
                    нейтральный цвет — перекраска стирала бы признак, по которому
                    личную тренировку узнают во все остальные дни.

                    Вне сегодняшней ячейки обводка не нужна. Известное
                    ограничение: brand-400 на сплошном --card-light даёт 3.55:1
                    в тёмной теме и 1.97:1 в светлой, то есть в светлой — ниже
                    порога 3:1 для нетекстовой графики; это осознанный выбор в
                    пользу узнаваемости акцента, записанный в design-system.md,
                    «Известные ограничения контраста». */}
                {markers?.hasPersonal && (
                  <span
                    data-indicator="personal"
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 rounded-full bg-brand-400 ${
                      isCurrentDay ? 'ring-1 ring-brand-50' : ''
                    }`}
                  />
                )}
                {markers?.hasWithClients && (
                  <span
                    data-indicator="with_clients"
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 rounded-full bg-trainer-text ${
                      isCurrentDay ? 'ring-1 ring-brand-50' : ''
                    }`}
                  />
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
