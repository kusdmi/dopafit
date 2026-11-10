interface Props {
  injuries: string | null | undefined;
  note?: string | null;
  className?: string;
}

/**
 * Health restrictions (injuries) + optional private trainer note.
 * Injuries use the danger accent; note is neutral. Renders nothing if both are empty.
 * Reused on participant selection and the active workout page. Semantic tokens only.
 */
export function ContraindicationsBlock({ injuries, note, className }: Props) {
  const hasInjuries = Boolean(injuries && injuries.trim());
  const hasNote = Boolean(note && note.trim());
  if (!hasInjuries && !hasNote) return null;

  return (
    <div className={`space-y-3 rounded-card border border-danger bg-card p-3 ${className ?? ''}`}>
      {hasInjuries && (
        <div>
          <p className="text-label mb-1 text-danger">Ограничения по здоровью</p>
          <p className="text-body-m whitespace-pre-line text-content">{injuries}</p>
        </div>
      )}
      {hasNote && (
        <div>
          <p className="text-label mb-1 text-muted">Примечание тренера</p>
          <p className="text-body-m whitespace-pre-line text-content">{note}</p>
        </div>
      )}
    </div>
  );
}
