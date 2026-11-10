import type { UseFormRegisterReturn } from 'react-hook-form';

import { DateInput } from '@/shared/ui/DateInput';
import { calendarOutline, timeOutline } from '@/shared/ui/icons';
import { Icon } from '@/shared/ui/primitives';
import { formatDate } from '@/shared/lib/time/formatDate';

interface Props {
  date: string;
  dateError?: string;
  dateField?: UseFormRegisterReturn;
  timeError?: string;
  timeField: UseFormRegisterReturn;
}

/**
 * Подпись поля в модалке записи (макет 392:4474): иконка + текст НАД плашкой,
 * а не внутри рамки, как у обычного `Input`. Поэтому поля здесь собраны
 * вручную, а не через фасад `Input` — у того подпись живёт внутри собственной
 * обводки, и формой макета это не переопределить.
 */
function FieldLabel({
  icon,
  children,
  htmlFor,
}: {
  icon: typeof calendarOutline;
  children: string;
  htmlFor?: string;
}) {
  return (
    <label className="flex items-center gap-[10px] text-body-m text-content" htmlFor={htmlFor}>
      <Icon icon={icon} className="text-[24px] text-content" />
      {children}
    </label>
  );
}

// A new booking uses the selected calendar day; only an existing booking can
// move to another day, so the edit form passes a date field.
export function BookingFields({ date, dateError, dateField, timeError, timeField }: Props) {
  return (
    <>
      <div className="flex flex-col gap-[10px]">
        <FieldLabel icon={calendarOutline} htmlFor={dateField ? 'booking-date' : undefined}>
          Дата
        </FieldLabel>
        {dateField ? (
          <>
            <DateInput
              id="booking-date"
              value={date}
              className={`text-h3 w-full rounded-[15px] bg-card-light p-[10px] font-normal text-content ${
                dateError ? 'outline outline-1 outline-danger' : ''
              }`}
              aria-invalid={dateError ? true : undefined}
              aria-errormessage={dateError ? 'booking-date-error' : undefined}
              {...dateField}
            />
            {dateError && (
              <p id="booking-date-error" role="alert" className="text-caption text-danger">
                {dateError}
              </p>
            )}
          </>
        ) : (
          <p className="text-body-m rounded-[15px] bg-card-light p-[10px] text-content">
            {formatDate(date)}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-[10px]">
        <FieldLabel icon={timeOutline} htmlFor="booking-time">
          Время
        </FieldLabel>
        {/* text-h3 (16px), а НЕ text-body-m (14px) из макета: iOS зумит страницу
            при фокусе поля мельче 16px, а отмотать зум нельзя — масштабирование
            в index.html запрещено. Тем же размером набраны все поля проекта
            (.app-field__control input), и это стережёт input-font-size.test.ts. */}
        <input
          id="booking-time"
          type="time"
          className={`text-h3 w-full rounded-[15px] bg-card-light p-[10px] font-normal text-content ${
            timeError ? 'outline outline-1 outline-danger' : ''
          }`}
          aria-invalid={timeError ? true : undefined}
          aria-errormessage={timeError ? 'booking-time-error' : undefined}
          {...timeField}
        />
        {timeError && (
          <p id="booking-time-error" role="alert" className="text-caption text-danger">
            {timeError}
          </p>
        )}
      </div>
    </>
  );
}
