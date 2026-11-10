import { DateInput } from '../DateInput';

import type { FieldProps } from './types';

interface BaseInputProps extends Omit<FieldProps, 'label' | 'error' | 'hidePasswordToggle'> {
  id?: string;
  ariaLabel: string;
  endPadding?: number;
}

export function BaseInput({ ariaLabel, endPadding = 0, style, type, ...props }: BaseInputProps) {
  if (type === 'date') {
    return (
      <DateInput aria-label={ariaLabel} className="w-full text-content" style={style} {...props} />
    );
  }
  return (
    <input
      type={type}
      aria-label={ariaLabel}
      style={{ paddingRight: endPadding, ...style }}
      {...props}
    />
  );
}
