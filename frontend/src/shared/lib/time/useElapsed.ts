import { useEffect, useState } from 'react';

/**
 * Seconds elapsed since `since` (ISO string), ticking every second.
 *
 * The value is always recomputed as `now - since`, never accumulated, so the
 * ticking interval is purely a re-render trigger. That lets us safely PAUSE the
 * interval whenever the document is hidden (the page sits in the app's persistent
 * tab DOM stack while another tab is active, or the app is backgrounded): no
 * wasteful 1 Hz re-renders fire off-screen. On the way back the displayed value
 * is recomputed from real wall-clock time, so it stays correct after a pause.
 *
 * @param since starting instant; null disables the timer (returns 0)
 * @param active optional gate (e.g. from Ion view lifecycle); when false the
 *   interval is paused even if the document is visible
 */
export function useElapsed(since: string | null, active = true): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (since == null || !active) return;

    let id: ReturnType<typeof setInterval> | undefined;

    const start = () => {
      // Recompute immediately on (re)start so a long hidden stretch doesn't show
      // a stale value for up to a second before the next tick.
      setNow(Date.now());
      if (id == null) id = setInterval(() => setNow(Date.now()), 1000);
    };
    const stop = () => {
      if (id != null) {
        clearInterval(id);
        id = undefined;
      }
    };

    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };

    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [since, active]);

  if (since == null) return 0;
  return Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
}

export function formatDuration(totalSeconds: number): string {
  const total = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${ss}`;
  }
  return `${m}:${ss}`;
}
