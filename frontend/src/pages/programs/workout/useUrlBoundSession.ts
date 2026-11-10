import { useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

import { useWorkoutStore } from '@/entities/workout/model/store';
import type { ActiveSession } from '@/entities/workout/model/types';
import { programSession } from '@/shared/config/paths';
import { useNavigation } from '@/shared/lib/navigation';
import { normalizePathname } from '@/shared/lib/normalizePathname';

export interface UrlBoundSession {
  /** Сессия, принадлежащая программе из URL, либо null. */
  active: ActiveSession | null;
  /** Переключение по вкладке параллельной сессии. */
  selectSession: (sessionKey: string) => void;
}

/**
 * Связка «программа из URL ↔ активная сессия в сторе» для экрана тренировки.
 *
 * URL — источник правды: при параллельных клиентских сессиях активной в сторе
 * может быть сессия ДРУГОЙ программы, и без этой связки экран программы A
 * показывал бы (и писал подходы в) тренировку программы B.
 */
export function useUrlBoundSession(programParamId: string): UrlBoundSession {
  const location = useLocation();
  const router = useNavigation();
  const sessions = useWorkoutStore((s) => s.sessions);
  const activeKey = useWorkoutStore((s) => s.activeKey);
  const switchTo = useWorkoutStore((s) => s.switchTo);

  const activeRaw = activeKey ? sessions[activeKey] : null;
  // Если id в маршруте нет (экран отрисован вне program-scoped маршрута) —
  // берём активную сессию как есть.
  const active = programParamId && activeRaw?.programId !== programParamId ? null : activeRaw;

  // A parametric Route renders a separate instance per pathname, so
  // after router.replace(programSession(B)) BOTH instances (/programs/A/session
  // and /programs/B/session) stay mounted and share one history/location. Only
  // the instance whose OWN session URL equals the current location.pathname is
  // the one the user navigated to — gate the URL→store sync on that. Without the
  // gate the off-URL instance also runs the effect, and the two ping-pong
  // switchTo(A)↔switchTo(B) → "Maximum update depth exceeded".
  const isActiveViewUrl =
    normalizePathname(location.pathname) === normalizePathname(programSession(programParamId));

  useEffect(() => {
    if (!isActiveViewUrl) return;
    if (!programParamId) return;
    if (activeRaw?.programId === programParamId) return;
    const match = Object.entries(sessions).find(([, s]) => s.programId === programParamId);
    if (match) switchTo(match[0]);
  }, [isActiveViewUrl, programParamId, sessions, activeRaw, switchTo]);

  // Tapping a session tab must move the URL to that session's program, not just
  // flip the store — otherwise the URL→store effect above would immediately snap
  // the active session back to the one matching the (unchanged) URL, leaving tabs
  // for other-program sessions dead. Navigate; the effect then syncs the store.
  //
  // replace, not push: toggling between the tabs of parallel sessions is a lateral
  // switch on the *same* workout screen, not a drill-down. Pushing would grow the
  // history stack by one entry per toggle, so a single Back would walk through the
  // whole switching trail instead of leaving the workout screen. replace keeps the
  // stack flat so Back exits the page as the user expects.
  const selectSession = useCallback(
    (sessionKey: string) => {
      const target = sessions[sessionKey];
      if (!target) return;
      if (target.programId === programParamId) {
        switchTo(sessionKey);
        return;
      }
      router.replace(programSession(target.programId));
    },
    [sessions, programParamId, switchTo, router],
  );

  return { active, selectSession };
}
