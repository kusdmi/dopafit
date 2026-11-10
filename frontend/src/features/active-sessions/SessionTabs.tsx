import { useWorkoutStore } from '@/entities/workout/model/store';
import type { ActiveSession } from '@/entities/workout/model/types';
import { useElapsed, formatDuration } from '@/shared/lib/time/useElapsed';

function label(session: ActiveSession): string {
  return session.participant.kind === 'self' ? 'Я' : session.participant.clientName;
}

function SessionCard({
  sessionKey,
  session,
  active,
  onSelect,
}: {
  sessionKey: string;
  session: ActiveSession;
  active: boolean;
  onSelect: (key: string) => void;
}) {
  const elapsed = useElapsed(session.startedAt);
  return (
    // Figma 1039:2494 — пилюля клиента: активная залита акцентом, остальные
    // на нейтральной обводке. Текст поверх заливки — парный fg акцента.
    <button
      type="button"
      aria-pressed={active}
      onClick={() => onSelect(sessionKey)}
      className={`flex shrink-0 flex-col items-center rounded-[14px] border px-[20px] py-[6px] ${
        active
          ? 'border-brand-400 bg-brand-400 text-chart-1-fg'
          : 'border-line text-content'
      }`}
    >
      <span className="text-caption">{label(session)}</span>
      <span className={`text-caption tabular-nums ${active ? '' : 'text-muted'}`}>
        {formatDuration(elapsed)}
      </span>
    </button>
  );
}

interface SessionTabsProps {
  /**
   * How to activate a session on tap. The workout route carries the program id
   * (/app/programs/:id/session) and WorkoutPage keeps the URL as the source of
   * truth, so it passes a handler that NAVIGATES to the tapped session's program
   * URL (an effect then syncs the store). Without an override we fall back to a
   * plain store switch, which is only safe outside a program-scoped route.
   */
  onSelect?: (sessionKey: string) => void;
}

/** Horizontal strip of active sessions; rendered only when there are ≥2 sessions. */
export function SessionTabs({ onSelect }: SessionTabsProps = {}) {
  const sessions = useWorkoutStore((s) => s.sessions);
  const activeKey = useWorkoutStore((s) => s.activeKey);
  const switchTo = useWorkoutStore((s) => s.switchTo);
  const select = onSelect ?? switchTo;

  const entries = Object.entries(sessions);
  if (entries.length < 2) return null;

  return (
    // 1039:2494 — над рядом пилюль стоит подпись «Клиенты на тренировке:».
    <div className="flex flex-col gap-[10px]">
      <p className="m-0 text-caption text-content">Клиенты на тренировке:</p>
      <div className="flex gap-[10px] overflow-x-auto pb-1">
      {entries.map(([key, session]) => (
        <SessionCard
          key={key}
          sessionKey={key}
          session={session}
          active={key === activeKey}
          onSelect={select}
        />
      ))}
      </div>
    </div>
  );
}
