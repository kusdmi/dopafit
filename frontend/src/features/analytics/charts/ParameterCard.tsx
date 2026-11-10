interface Props {
  label: string;
  /** Series colour — the marker dot and the change badge take it. */
  color: string;
  min: number;
  avg: number;
  max: number;
  changePercent: number;
  /** Unit suffix for the values, when the series carries one (custom fields). */
  unit?: string;
}

function Stat({ caption, value }: { caption: string; value: string }) {
  return (
    // Строка, а не колонка: подпись слева, значение справа. Три колонки на
    // ширину карточки схлопывались, как только значения выходили длиннее
    // «82.5» (с единицей у кастомных полей — всегда), и три числа читались
    // одним числом.
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-body-s shrink-0 text-muted">{caption}</span>
      <span className="text-h3 min-w-0 truncate text-content">{value}</span>
    </div>
  );
}

/**
 * One anthropometry parameter summary (Figma 852:1857): a colour-dotted
 * heading carrying the period change, over Мин / Сред / Макс rows.
 *
 * Divergence from the mock, noted deliberately: the mock draws a separate
 * change badge under EACH of the three columns plus an "Актуальный замер" row.
 * `ParameterStats` carries a single `change_percent` for the whole series and
 * no current-measurement field, so inventing three different badges would mean
 * displaying the same number three times as if it were three. One change for
 * the series is rendered instead, on the heading line it actually describes.
 *
 * The three stats are ROWS, not columns. Two of these cards sit side by side in
 * a grid, so each gets roughly half the screen; three centred columns inside
 * that collapsed as soon as a value grew past four characters — with a custom
 * field's unit appended it always does — and "82.5 82.5 82.5" ran together as a
 * single number. A label/value row per stat holds at any width.
 */
export function ParameterCard({ label, color, min, avg, max, changePercent, unit }: Props) {
  const suffix = unit ? ` ${unit}` : '';
  const fmt = (v: number) => `${v}${suffix}`;
  const sign = changePercent > 0 ? '+' : '';

  return (
    // Ни обводки, ни заливки. Обводку нельзя — карточка лежит ВНУТРИ обведённой
    // ChartCard, а два уровня рамок подряд стирают признак «отдельный объект»
    // (design-system.md «Вложенность карточек»). Но и заливка `bg-card-light`
    // не подошла: сплошное пятно читалось тяжелее самой карточки вокруг него, а
    // `muted` на `card-light` даёт всего 3.35:1 в тёмной теме — ниже порога
    // 4.5:1 для текста (это же зафиксировано в «Известные ограничения
    // контраста»). Без подложки подписи ложатся на фон страницы: 6.23–6.60:1 в
    // тёмной теме и 8.86–9.42:1 в светлой. Группу держат отступ и точка серии
    // слева — подложка для этого не нужна.
    // Боковой отступ — свой `px-2`, как у заголовка ChartCard. Карточка лежит
    // в контейнере с урезанным `px-2` (он отдан ширине графика), а заголовок
    // блока добирает недостающие 8px собственным padding. Без такого же
    // padding подписи параметров вставали на 8px левее заголовка над ними.
    <div className="flex flex-col gap-2.5 rounded-[14px] px-2 py-1">
      {/* Заголовок и изменение — одна строка: бейдж относится ко всей серии,
          а не к отдельному показателю под ним. */}
      <div className="flex items-center justify-between gap-2.5">
        <span className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden="true"
            className="inline-block size-3 shrink-0 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span className="text-h3 truncate text-content">{label}</span>
        </span>
        {/* Без обводки: бейдж лежит внутри обведённой ChartCard — своя рамка
            дала бы второй уровень (design-system.md «Вложенность карточек»).
            Направление изменения несёт тематический success/danger, читаемый в
            обеих темах; серия уже опознаётся точкой слева. */}
        <span
          className={`text-tag shrink-0 tabular-nums ${
            changePercent > 0 ? 'text-success' : changePercent < 0 ? 'text-danger' : 'text-muted'
          }`}
        >
          {sign}
          {changePercent}%
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <Stat caption="Мин" value={fmt(min)} />
        <Stat caption="Сред" value={fmt(avg)} />
        <Stat caption="Макс" value={fmt(max)} />
      </div>
    </div>
  );
}
