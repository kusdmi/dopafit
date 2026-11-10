import { act, fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { formatDateShort } from '../lib/time/formatDate';
import { LineChart } from './LineChart';

// jsdom does not implement PointerEvent, so fireEvent.pointerDown/Move would
// fall back to plain Event (which lacks clientX/clientY). Provide a minimal
// polyfill that inherits from MouseEvent so coordinates are passed through.
if (typeof window !== 'undefined' && !window.PointerEvent) {
  class PointerEventPolyfill extends MouseEvent {
    constructor(type: string, init?: PointerEventInit) {
      super(type, init);
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).PointerEvent = PointerEventPolyfill;
}

const series = [
  {
    id: 'weight',
    color: 'var(--color-brand-500)',
    points: [
      { date: '2026-01-01', value: 80 },
      { date: '2026-02-01', value: 78 },
      { date: '2026-03-01', value: 76 },
    ],
  },
];

it('renders one polyline per series and a circle per point', () => {
  const { container } = render(<LineChart series={series} />);
  expect(container.querySelectorAll('polyline')).toHaveLength(1);
  expect(container.querySelectorAll('circle')).toHaveLength(3);
});

it('renders an empty state when there are no points', () => {
  const { getByText } = render(<LineChart series={[]} emptyLabel="Нет данных" />);
  expect(getByText('Нет данных')).toBeInTheDocument();
});

it('shows a cursor line on pointer down and hides it on pointer up', () => {
  const { container } = render(<LineChart series={series} />);
  const svg = container.querySelector('svg')!;
  expect(container.querySelector('[data-cursor]')).toBeNull();

  fireEvent.pointerDown(svg, { clientX: 10, clientY: 10 });
  fireEvent.pointerMove(svg, { clientX: 40, clientY: 11 });
  expect(container.querySelector('[data-cursor]')).not.toBeNull();
  expect(container.querySelector('[data-tooltip]')).not.toBeNull();

  fireEvent.pointerUp(svg);
  expect(container.querySelector('[data-cursor]')).toBeNull();
});

it('formats an ISO date into a short russian form', () => {
  expect(formatDateShort('2026-03-01')).toBe('1 мар');
  expect(formatDateShort('2026-01-15')).toBe('15 янв');
  expect(formatDateShort('2026-12-31')).toBe('31 дек');
});

it('renders axis labels with formatted dates', () => {
  const { container, getByText } = render(<LineChart series={series} />);
  expect(container.querySelectorAll('text').length).toBeGreaterThan(0);
  // first date 2026-01-01 and last date 2026-03-01 appear as axis labels
  expect(getByText('1 янв')).toBeInTheDocument();
  expect(getByText('1 мар')).toBeInTheDocument();
});

it('renders multiple horizontal grid lines for the Y axis ticks', () => {
  const { container } = render(<LineChart series={series} />);
  // 5 levels (TICK_COUNT + 1) -> at least 4 grid lines
  expect(container.querySelectorAll('[data-grid]').length).toBeGreaterThanOrEqual(4);
});

it('renders intermediate Y tick labels between min and max', () => {
  const ticks = [
    {
      id: 'weight',
      color: 'var(--color-brand-500)',
      points: [
        { date: '2026-01-01', value: 78 },
        { date: '2026-02-01', value: 83 },
      ],
    },
  ];
  // ticks: 78, 79.25, 80.5, 81.75, 83 -> Math.round -> 78, 79, 81, 82, 83
  const { getByText } = render(<LineChart series={ticks} />);
  expect(getByText('78')).toBeInTheDocument();
  expect(getByText('83')).toBeInTheDocument();
  // an intermediate label is present
  expect(getByText('81')).toBeInTheDocument();
});

it('shows every x-axis date when there are six points (dashboard measurements)', () => {
  const sixPoints = [
    {
      id: 'weight',
      color: 'var(--color-brand-500)',
      points: [
        { date: '2026-01-01', value: 80 },
        { date: '2026-02-01', value: 79 },
        { date: '2026-03-01', value: 78 },
        { date: '2026-04-01', value: 77 },
        { date: '2026-05-01', value: 76 },
        { date: '2026-06-01', value: 75 },
      ],
    },
  ];
  const { getByText } = render(<LineChart series={sixPoints} />);
  // Все шесть дат должны иметь подпись, включая «1 мая».
  expect(getByText('1 янв')).toBeInTheDocument();
  expect(getByText('1 фев')).toBeInTheDocument();
  expect(getByText('1 мар')).toBeInTheDocument();
  expect(getByText('1 апр')).toBeInTheDocument();
  expect(getByText('1 май')).toBeInTheDocument();
  expect(getByText('1 июн')).toBeInTheDocument();
});

it('caps x-axis labels so they do not collide when there are many points', () => {
  const manyPoints = Array.from({ length: 12 }, (_, i) => ({
    date: `2026-${String(i + 1).padStart(2, '0')}-01`,
    value: 80 - i,
  }));
  const series12 = [{ id: 'weight', color: 'var(--color-brand-500)', points: manyPoints }];
  const { container } = render(<LineChart series={series12} />);
  // Подписи оси X помечены ключом xt-*; их не больше MAX_X_LABELS (6).
  const xLabels = container.querySelectorAll('text[text-anchor]');
  expect(xLabels.length).toBeLessThanOrEqual(6);
});

it('shows a formatted date (not raw ISO) in the tooltip on pointer down', () => {
  const { container } = render(<LineChart series={series} />);
  const svg = container.querySelector('svg')!;

  fireEvent.pointerDown(svg, { clientX: 10, clientY: 10 });
  fireEvent.pointerMove(svg, { clientX: 40, clientY: 11 });
  const tooltip = container.querySelector('[data-tooltip]')!;
  // in jsdom rect.width=0 -> active index 0 -> first date 2026-01-01
  expect(tooltip.textContent).toContain('1 янв');
  expect(tooltip.textContent).not.toContain('2026-01-01');
});

it('shows the full series label in the tooltip without clipping it', () => {
  const labelled = [
    {
      id: 'measurement',
      label: 'Повторения',
      color: 'var(--color-brand-500)',
      points: [{ date: '2026-01-01', value: 9 }],
    },
  ];
  const { container } = render(<LineChart series={labelled} />);
  const svg = container.querySelector('svg')!;

  fireEvent.pointerDown(svg, { clientX: 10, clientY: 10 });
  fireEvent.pointerMove(svg, { clientX: 40, clientY: 11 });
  const tooltip = container.querySelector('[data-tooltip]')!;
  // full russian label + value present (no truncate clipping of the row text)
  expect(tooltip.textContent).toContain('Повторения: 9');
});

it('disables text selection on the svg to avoid selecting page text on scrub', () => {
  const { container } = render(<LineChart series={series} />);
  const svg = container.querySelector('svg')!;
  expect(svg.style.userSelect).toBe('none');
});

it('keeps touch-action pan-y so vertical scroll works before activation', () => {
  const { container } = render(<LineChart series={series} />);
  const svg = container.querySelector('svg')! as SVGSVGElement;
  // Scroll suppression during a scrub is done by a non-passive touchmove
  // listener + preventDefault, NOT by flipping touch-action (which is latched
  // at gesture start). So touch-action stays pan-y at all times.
  expect(svg.style.touchAction).toBe('pan-y');
});

it('registers a non-passive touchmove listener on the svg', () => {
  const addSpy = vi.spyOn(SVGElement.prototype, 'addEventListener');
  render(<LineChart series={series} />);
  const call = addSpy.mock.calls.find(
    ([type, , opts]) => type === 'touchmove' && typeof opts === 'object' && opts?.passive === false,
  );
  expect(call).toBeTruthy();
  addSpy.mockRestore();
});

it('preventDefaults touchmove only while the scrub is activated', () => {
  vi.useFakeTimers();
  try {
    const { container } = render(<LineChart series={series} />);
    const svg = container.querySelector('svg')!;

    // Not activated yet: a touchmove must NOT be prevented (page scroll allowed).
    const before = new Event('touchmove', { cancelable: true, bubbles: true });
    svg.dispatchEvent(before);
    expect(before.defaultPrevented).toBe(false);

    // Activate via hold, then a touchmove MUST be prevented (scroll suppressed).
    fireEvent.pointerDown(svg, { clientX: 20, clientY: 20 });
    act(() => {
      vi.advanceTimersByTime(150);
    });
    const during = new Event('touchmove', { cancelable: true, bubbles: true });
    svg.dispatchEvent(during);
    expect(during.defaultPrevented).toBe(true);

    // After release: touchmove no longer prevented.
    fireEvent.pointerUp(svg);
    const after = new Event('touchmove', { cancelable: true, bubbles: true });
    svg.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  } finally {
    vi.useRealTimers();
  }
});

it('scales the Y axis to actual min/max values without forcing zero', () => {
  const centered = [
    {
      id: 'weight',
      color: 'var(--color-brand-500)',
      points: [
        { date: '2026-01-01', value: 78 },
        { date: '2026-02-01', value: 80 },
        { date: '2026-03-01', value: 82 },
      ],
    },
  ];
  const { getByText, queryByText } = render(<LineChart series={centered} />);
  // axis labels show actual rawMax/rawMin, not 0
  expect(getByText('82')).toBeInTheDocument();
  expect(getByText('78')).toBeInTheDocument();
  expect(queryByText('0')).toBeNull();
});

it('does not show the tooltip when the gesture is a vertical scroll', () => {
  const { container } = render(<LineChart series={series} />);
  const svg = container.querySelector('svg')!;

  fireEvent.pointerDown(svg, { clientX: 20, clientY: 20 });
  // finger moves mostly vertically -> this is a page scroll, not a scrub
  fireEvent.pointerMove(svg, { clientX: 22, clientY: 60 });
  expect(container.querySelector('[data-tooltip]')).toBeNull();
});

it('shows the tooltip on a horizontal scrub', () => {
  const { container } = render(<LineChart series={series} />);
  const svg = container.querySelector('svg')!;

  fireEvent.pointerDown(svg, { clientX: 20, clientY: 20 });
  // finger moves mostly horizontally -> intentional scrub
  fireEvent.pointerMove(svg, { clientX: 60, clientY: 22 });
  expect(container.querySelector('[data-tooltip]')).not.toBeNull();
});

it('activates a horizontal scrub even with a small vertical component', () => {
  const { container } = render(<LineChart series={series} />);
  const svg = container.querySelector('svg')!;

  fireEvent.pointerDown(svg, { clientX: 20, clientY: 20 });
  // dx=30 (> threshold) with a non-trivial dy=20; vertical does not dominate
  // (dy < dx*1.5), so a light vertical wobble must NOT kill the scrub.
  fireEvent.pointerMove(svg, { clientX: 50, clientY: 40 });
  expect(container.querySelector('[data-tooltip]')).not.toBeNull();
});

it('keeps the active cursor once scrubbing, even if the finger moves vertically', () => {
  const { container } = render(<LineChart series={series} />);
  const svg = container.querySelector('svg')!;

  fireEvent.pointerDown(svg, { clientX: 20, clientY: 20 });
  fireEvent.pointerMove(svg, { clientX: 60, clientY: 22 }); // activate scrub
  expect(container.querySelector('[data-tooltip]')).not.toBeNull();
  // Now move mostly vertically — an activated scrub must hold, not reset.
  fireEvent.pointerMove(svg, { clientX: 62, clientY: 120 });
  expect(container.querySelector('[data-tooltip]')).not.toBeNull();
});

it('shows the tooltip on a stationary press-and-hold after the hold delay', () => {
  vi.useFakeTimers();
  try {
    const { container } = render(<LineChart series={series} />);
    const svg = container.querySelector('svg')!;

    fireEvent.pointerDown(svg, { clientX: 20, clientY: 20 });
    // Before the hold delay, nothing is shown (no movement yet).
    expect(container.querySelector('[data-tooltip]')).toBeNull();
    // After the hold delay elapses with the finger held in place, the tooltip appears.
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(container.querySelector('[data-tooltip]')).not.toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

it('keeps the tooltip active after a hold even when the finger then scrubs vertically', () => {
  vi.useFakeTimers();
  try {
    const { container } = render(<LineChart series={series} />);
    const svg = container.querySelector('svg')!;

    fireEvent.pointerDown(svg, { clientX: 20, clientY: 20 });
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(container.querySelector('[data-tooltip]')).not.toBeNull();
    // Once activated by hold, a vertical move must NOT drop the tooltip.
    fireEvent.pointerMove(svg, { clientX: 22, clientY: 140 });
    expect(container.querySelector('[data-tooltip]')).not.toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

it('renders the svg with visible overflow so the tooltip is not clipped', () => {
  const { container } = render(
    <LineChart
      series={[{ id: 'w', color: '#f00', points: [
        { date: '2026-01-01', value: 10 },
        { date: '2026-01-02', value: 20 },
      ] }]}
    />,
  );
  const svg = container.querySelector('svg')!;
  expect(svg.style.overflow).toBe('visible');
});

it('re-registers the non-passive touchmove listener when the svg node remounts', () => {
  const addSpy = vi.spyOn(SVGElement.prototype, 'addEventListener');
  const series = [{ id: 'w', color: '#f00', points: [
    { date: '2026-01-01', value: 10 },
    { date: '2026-01-02', value: 20 },
  ] }];
  const countNonPassiveTouchmove = () =>
    addSpy.mock.calls.filter(
      ([type, , opts]) =>
        type === 'touchmove' && typeof opts === 'object' && opts?.passive === false,
    ).length;
  const removeSpy = vi.spyOn(SVGElement.prototype, 'removeEventListener');
  const { rerender } = render(<LineChart key="a" series={series} />);
  const countAfterFirst = countNonPassiveTouchmove();
  expect(countAfterFirst).toBeGreaterThanOrEqual(1);
  // Force a fresh SVG node (new key = unmount + remount, like the tab round-trip).
  rerender(<LineChart key="b" series={series} />);
  expect(countNonPassiveTouchmove()).toBeGreaterThan(countAfterFirst);
  // The old node's listener must be unbound on remount, else it leaks. Guards
  // against a future regression that adds the new listener but drops the removal.
  expect(removeSpy.mock.calls.some(([type]) => type === 'touchmove')).toBe(true);
  addSpy.mockRestore();
  removeSpy.mockRestore();
});

it('does not show the tooltip on hold if the finger scrolled away vertically first', () => {
  vi.useFakeTimers();
  try {
    const { container } = render(<LineChart series={series} />);
    const svg = container.querySelector('svg')!;

    fireEvent.pointerDown(svg, { clientX: 20, clientY: 20 });
    // A clear vertical scroll cancels the pending hold-timer.
    fireEvent.pointerMove(svg, { clientX: 22, clientY: 60 });
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(container.querySelector('[data-tooltip]')).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

// design-system.md requires series to stay tellable apart without relying on
// hue. These pin the second encoding channel (dash pattern + marker shape) and
// the rule that it only kicks in once there is more than one series.
describe('non-colour series encoding', () => {
  const twoSeries = [
    { id: 'a', label: 'Вес', color: 'var(--color-chart-1)', points: series[0].points },
    {
      id: 'b',
      label: 'Повторения',
      color: 'var(--color-chart-2)',
      points: [
        { date: '2026-01-01', value: 10 },
        { date: '2026-02-01', value: 12 },
        { date: '2026-03-01', value: 11 },
      ],
    },
  ];

  it('leaves a lone series solid and circle-marked', () => {
    const { container } = render(<LineChart series={series} />);
    const line = container.querySelector('polyline')!;
    expect(line.getAttribute('stroke-dasharray')).toBeNull();
    expect(container.querySelectorAll('rect, polygon')).toHaveLength(0);
  });

  it('gives each of several series a distinct dash and marker shape', () => {
    const { container } = render(<LineChart series={twoSeries} />);
    const [first, second] = Array.from(container.querySelectorAll('polyline'));
    // First stays solid so the primary series reads cleanly; the second is dashed.
    expect(first.getAttribute('stroke-dasharray')).toBeNull();
    expect(second.getAttribute('stroke-dasharray')).toBeTruthy();
    // ...and it must not collide with the cursor line's own "3 3" pattern.
    expect(second.getAttribute('stroke-dasharray')).not.toBe('3 3');
    // Different marker shapes: circles for the first, squares for the second.
    expect(container.querySelectorAll('rect').length).toBeGreaterThan(0);
  });

  it('repeats the dash and shape in the legend, not just the colour', () => {
    const { container, getByText } = render(<LineChart series={twoSeries} />);
    expect(getByText('Вес')).toBeInTheDocument();
    expect(getByText('Повторения')).toBeInTheDocument();
    // Each legend item carries a swatch svg drawing the line + marker.
    const swatches = container.querySelectorAll('li svg');
    expect(swatches).toHaveLength(2);
    expect(swatches[1].querySelector('line')!.getAttribute('stroke-dasharray')).toBeTruthy();
  });
});
