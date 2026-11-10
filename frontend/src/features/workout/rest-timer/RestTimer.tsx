import { formatDuration, useElapsed } from '@/shared/lib/time/useElapsed';

interface RestTimerProps {
  lastSetAt: string | null;
}

export function RestTimer({ lastSetAt }: RestTimerProps) {
  const seconds = useElapsed(lastSetAt);
  return (
    <span className="text-content tabular-nums">
      {lastSetAt ? formatDuration(seconds) : '—'}
    </span>
  );
}
