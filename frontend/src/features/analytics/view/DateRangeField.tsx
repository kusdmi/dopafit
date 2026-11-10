import { DateInput } from '@/shared/ui/DateInput';
import { fieldClass } from '@/shared/ui/field';

interface Props {
  label: string;
  dateFrom: string;
  dateTo: string;
  onChange: (next: { dateFrom: string; dateTo: string }) => void;
}

/** Native date pickers with a stable day-first display; stacked on narrow screens. */
export function DateRangeField({ label, dateFrom, dateTo, onChange }: Props) {
  return (
    <div className="flex flex-col">
      <span className="py-2.5 text-body-s text-content">{label}</span>
      <div className="flex flex-col gap-2.5 min-[400px]:flex-row min-[400px]:items-center">
        <DateInput
          aria-label={`${label}: начало`}
          value={dateFrom}
          max={dateTo || undefined}
          onChange={(e) => onChange({ dateFrom: e.target.value, dateTo })}
          className={`${fieldClass} min-w-0 flex-1`}
        />
        <span aria-hidden="true" className="hidden text-body-m text-muted min-[400px]:inline">
          —
        </span>
        <DateInput
          aria-label={`${label}: конец`}
          value={dateTo}
          min={dateFrom || undefined}
          onChange={(e) => onChange({ dateFrom, dateTo: e.target.value })}
          className={`${fieldClass} min-w-0 flex-1`}
        />
      </div>
    </div>
  );
}
