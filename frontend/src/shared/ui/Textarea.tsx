import { useId, type TextareaHTMLAttributes } from 'react';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
}

export function Textarea({ label, error, rows = 4, id, ...props }: TextareaProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return (
    <div className={`app-field${error ? ' app-field--error' : ''}`}>
      <label htmlFor={fieldId} className="app-field__label text-label">
        {label}
      </label>
      <textarea
        id={fieldId}
        rows={rows}
        aria-invalid={!!error}
        aria-describedby={error ? `${fieldId}-error` : undefined}
        className="text-h3 w-full resize-none bg-transparent text-content placeholder:text-muted outline-none"
        {...props}
      />
      {error ? (
        <p id={`${fieldId}-error`} role="alert" className="app-field__error text-caption">
          {error}
        </p>
      ) : null}
    </div>
  );
}
