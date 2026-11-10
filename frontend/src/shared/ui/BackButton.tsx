import { HistoryBack, ToolbarActions } from '@/shared/ui/primitives';

import { paths } from '@/shared/config/paths';

interface Props {
  // Explicit destination; maps to HistoryBack defaultHref. Defaults to /app/home.
  to?: string;
}

export function BackButton({ to = paths.home }: Props = {}) {
  return (
    <ToolbarActions slot="start">
      <HistoryBack defaultHref={to} text="" />
    </ToolbarActions>
  );
}
