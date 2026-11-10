import type { ReactNode } from 'react';

interface Props {
  /** Card heading; rendered as an <h2> under the page's single <h1>. */
  title: ReactNode;
  children: ReactNode;
}

/**
 * The chart container from the analytics mocks (771:1629 / 852:1926): a 16px
 * radius box outlined in --line over the page gradient, with an H3 heading.
 * No --card fill — the mock shows the page gradient through it.
 *
 * The side padding is deliberately smaller than the vertical one: what this
 * card holds is a chart, and every px of side padding is subtracted from the
 * plot width on top of the page's own 24px gutter. The heading keeps the full
 * inset via its own padding, so only the plotting area gets the extra width.
 */
export function ChartCard({ title, children }: Props) {
  return (
    <section className="flex flex-col gap-4 rounded-[16px] border border-line px-2 py-4">
      <h2 className="text-h3 px-2 text-content">{title}</h2>
      {children}
    </section>
  );
}
