import { type ReactNode } from 'react';

import { toApiError } from '@/shared/api/client';
import { errorText } from '@/shared/api/error-reasons';
import { paths } from '@/shared/config/paths';
import { PageShell } from '@/shared/ui/PageShell';

export function SettingsShell({
  title,
  subtitle,
  children,
  root = false,
  embedded = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  root?: boolean;
  embedded?: boolean;
}) {
  if (embedded) return <section className="flex flex-col gap-4">{children}</section>;
  return (
    <PageShell
      title={title}
      subtitle={root ? subtitle : undefined}
      backHref={root ? undefined : paths.settings}
    >
      {children}
    </PageShell>
  );
}

export function StatusText({ message }: { message: string }) {
  if (!message) {
    return null;
  }
  return <p className="text-body-s text-success">{message}</p>;
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
