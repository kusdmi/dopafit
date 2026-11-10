import { toApiError } from '@/shared/api/client';
import { errorText } from '@/shared/api/error-reasons';

export function ContactBadge({ verified }: { verified: boolean }) {
  return verified ? (
    <span className="text-tag inline-flex items-center rounded-full bg-success-soft-bg px-2.5 py-0.5 text-success-soft-fg">
      Подтверждён <span aria-hidden="true">✓</span>
    </span>
  ) : (
    <span className="text-tag inline-flex items-center rounded-full bg-card-light px-2.5 py-0.5 text-muted">
      Не подтверждён
    </span>
  );
}

export function ErrorText({ error }: { error: unknown }) {
  if (!error) {
    return null;
  }
  return (
    <p role="alert" className="text-body-s text-danger">
      {errorText(error, toApiError(error).message)}
    </p>
  );
}
