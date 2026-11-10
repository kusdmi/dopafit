import { useState, type ComponentPropsWithRef } from 'react';

import { formatDateNumeric } from '../lib/time/formatDate';
import { calendarOutline } from './icons';
import { Icon } from './primitives';

type Props = Omit<ComponentPropsWithRef<'input'>, 'type'>;

/** Keeps the native picker and ISO form value with a stable day-first display. */
export function DateInput({
  value,
  defaultValue,
  onChange,
  onClick,
  className = '',
  style,
  placeholder = 'ДД.ММ.ГГГГ',
  ...props
}: Props) {
  const [draft, setDraft] = useState(String(defaultValue ?? ''));
  const date = value === undefined ? draft : String(value);

  return (
    <span
      className={`relative flex min-w-0 items-center gap-2 text-h3 focus-within:outline-2 focus-within:outline-brand-400 ${className}`}
      style={style}
    >
      <span aria-hidden="true" className={`min-w-0 flex-1 truncate ${date ? '' : 'text-muted'}`}>
        {date ? formatDateNumeric(date) : placeholder}
      </span>
      <Icon icon={calendarOutline} className="shrink-0 text-[18px] text-muted" />
      <input
        {...props}
        type="date"
        lang="ru"
        value={value}
        defaultValue={defaultValue}
        className="absolute inset-0 h-full w-full cursor-pointer text-h3 opacity-0 disabled:cursor-default"
        onChange={(event) => {
          setDraft(event.currentTarget.value);
          onChange?.(event);
        }}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented && !props.readOnly) event.currentTarget.showPicker?.();
        }}
      />
    </span>
  );
}
