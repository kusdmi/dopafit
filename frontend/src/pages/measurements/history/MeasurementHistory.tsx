import { useMeasurements } from '@/entities/measurement/api/use-measurements';
import { summaryMetrics } from '@/entities/measurement/model/summary';
import { useDelayedVisible } from '@/shared/lib/loading/useDelayedVisible';
import { chevronForward } from '@/shared/ui/icons';
import { Icon } from '@/shared/ui/primitives';

interface Props {
  onSelect: (id: string) => void;
}

const MONTHS_SHORT = [
  'янв.',
  'фев.',
  'мар.',
  'апр.',
  'мая',
  'июн.',
  'июл.',
  'авг.',
  'сен.',
  'окт.',
  'ноя.',
  'дек.',
];

/** ISO date -> { year: "2026", day: "16 янв." }. */
function splitDate(iso: string): { year: string; day: string } {
  const [y, m, d] = iso.split('-');
  const month = MONTHS_SHORT[Number(m) - 1] ?? m;
  return { year: y ?? iso, day: `${Number(d)} ${month}` };
}

export function MeasurementHistory({ onSelect }: Props) {
  const { data, isLoading } = useMeasurements();
  const items = data?.items ?? [];
  // Не показываем «Нет записей», пока первый запрос не резолвнулся (наблюдение
  // B-2: пустое состояние мигало до прихода данных). Порог гасит и вспышку на
  // мгновенных ответах из кэша.
  const showEmpty = useDelayedVisible(isLoading);

  if (items.length === 0) {
    if (isLoading && !showEmpty) return null;
    return <p className="text-body-s text-center text-muted">Нет записей</p>;
  }

  return (
    <ul className="flex flex-col gap-[15px]">
      {items.map((item) => {
        const isPending = (item as { __pendingSync?: boolean }).__pendingSync;
        const { year, day } = splitDate(item.date);
        const metrics = summaryMetrics(item);
        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onSelect(item.id)}
              // The visible date is split into year and day per the mock, so the
              // row carries the whole date in its accessible name instead.
              aria-label={`Замер за ${day} ${year}`}
              className="flex w-full items-center justify-between gap-[15px] rounded-[14px] border border-line px-[22px] py-[10px] text-left transition-colors hover:bg-card-light"
            >
              {/* Дата — единственное акцентное пятно в строке, и год стоит
                  рядом с днём, а не над ним другим размером: «14 сен. 2026»
                  читается как одна дата. Значения замеров — обычный --content:
                  когда и дата, и три значения были одинаково оранжевыми, в
                  строке не выделялось ничего. */}
              <div className="flex shrink-0 items-baseline gap-1">
                <span className="text-h3 text-brand-text">{day}</span>
                <span className="text-caption text-muted">{year}</span>
              </div>
              <div className="flex items-center gap-[15px]">
                <div className="flex items-center gap-[10px]">
                  {metrics.map((metric) => (
                    <div key={metric.key} className="flex flex-col items-end">
                      <span className="text-caption text-muted">{metric.label}</span>
                      <span className="text-h3 text-content">
                        {metric.value} {metric.unit}
                      </span>
                    </div>
                  ))}
                </div>
                {isPending ? (
                  <span className="text-caption rounded-full bg-card-light px-2 py-0.5 text-muted">
                    Ожидает синхронизации
                  </span>
                ) : null}
                <Icon icon={chevronForward} className="shrink-0 text-content" />
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
