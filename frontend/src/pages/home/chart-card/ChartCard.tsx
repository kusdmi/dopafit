import type { ReactNode } from 'react';

import { chevronDown } from '@/shared/ui/icons';
import { Icon } from '@/shared/ui/primitives';

import type { DeltaTone } from './delta';

interface Props {
  title: string;
  /** Secondary line under the title (period, exercise name…). */
  subtitle?: string;
  /**
   * Remounts the subtitle when it changes so the short fade-in replays. The
   * chart itself animates its own data transition, so it is deliberately NOT
   * remounted — that would rebuild the amCharts instance on every switch.
   */
  subtitleKey?: string;
  /** Signed change for the period, rendered on the right. */
  delta?: ReactNode;
  /** Percentage change under the delta. */
  deltaHint?: ReactNode;
  /**
   * Colours the delta pair. Falls back to the muted content colour so a card
   * without a direction (no data yet) does not imply good/bad.
   */
  deltaTone?: DeltaTone;
  /** Opens the parameter picker; renders the chevron next to the title. */
  onPick?: () => void;
  pickLabel?: string;
  children: ReactNode;
}

// Figma 392:2090 / 392:2159 ("Container"): the two dashboard chart plates —
// --neutral-900 fill (the `surface` alias, which reads as a plate against the
// page gradient), 24px radius, 20px padding. The header row pairs an H3 title
// plus a caption subtitle on the left with the period delta on the right.
const TONE_CLASS: Record<DeltaTone, string> = {
  // Figma paints the weight card's drop in the green series colour and the
  // strength card's gain in the accent. Both are "series" colours on a plate,
  // so they come from the chart tokens rather than the success/danger aliases —
  // a weight drop is not a "success" semantically.
  up: 'text-brand-400',
  down: 'text-chart-3',
  neutral: 'text-muted',
};

export function ChartCard({
  title,
  subtitle,
  subtitleKey,
  delta,
  deltaHint,
  deltaTone = 'neutral',
  onPick,
  pickLabel,
  children,
}: Props) {
  const heading = (
    <>
      <span className="text-h3 text-content">{title}</span>
      {onPick && <Icon icon={chevronDown} className="shrink-0 text-content" />}
    </>
  );

  return (
    <section className="flex flex-col gap-4 rounded-[24px] bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          {onPick ? (
            <button
              type="button"
              onClick={onPick}
              aria-label={pickLabel}
              className="flex items-center gap-2 text-left"
            >
              {heading}
            </button>
          ) : (
            <div className="flex items-center gap-2">{heading}</div>
          )}
          {subtitle && (
            <span key={subtitleKey} className="animate-fade-in text-label text-muted">
              {subtitle}
            </span>
          )}
        </div>
        {delta != null && (
          <div className={`flex shrink-0 flex-col items-end ${TONE_CLASS[deltaTone]}`}>
            <span className="text-stat-s">{delta}</span>
            {deltaHint != null && <span className="text-label">{deltaHint}</span>}
          </div>
        )}
      </div>
      {children}
    </section>
  );
}
