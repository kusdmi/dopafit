import { type ReactNode } from 'react';

import { paths } from '@/shared/config/paths';
import { PageShell } from '@/shared/ui/PageShell';

export function SupportShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <PageShell title={title} backHref={paths.settings}>
      {children}
    </PageShell>
  );
}
