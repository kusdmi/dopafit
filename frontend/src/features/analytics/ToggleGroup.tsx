interface Option<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  /** Caption above the row; omitted on the top-level chart-type switch. */
  label?: string;
  options: Option<T>[];
  value: T;
  onChange: (next: T) => void;
  /** Accessible name for the row when no visible `label` is rendered. */
  ariaLabel?: string;
}

/**
 * The analytics mocks' two-up choice row (768:1058 nodes 769:1384 / 769:1385 /
 * 771:1400): two equal-width 14px-radius buttons with a 16px gap — the selected
 * one filled with the accent, the other with --card-light.
 *
 * Deliberately NOT the shared `.segment` primitive: that is a pill-shaped
 * track (radius 37.5px, 3px inset, 5px gap) drawn from a different Figma node,
 * and reshaping it would change every screen that uses it. This stays local to
 * the analytics feature rather than becoming a new global primitive, since the
 * mock only uses it here.
 *
 * The mock only ever draws TWO options, but the row is also used with three
 * (METRIC_META) and four (PHOTO_KINDS). At four, the mock's fixed geometry can
 * no longer fit a phone: 22px side padding each plus a 16px gap needs 450px of
 * intrinsic width against ~342px of content area on a 390px screen, and
 * `flex-1` does not shrink a button below its own text — so the row pushed the
 * whole PAGE sideways.
 *
 * The row therefore has two modes, measured at 342px:
 *   - TWO options — the mock's case, unchanged: equal halves (`flex-1
 *     basis-0`), 22px padding, labels allowed to wrap.
 *   - THREE OR MORE — each option sizes to its own label (`flex-1 shrink-0
 *     basis-auto`, i.e. grow into slack but never below the text) with tighter
 *     padding, and the ROW scrolls. Overflow stays inside the track instead of
 *     reaching the document, and no label is ever clipped.
 *
 * `whitespace-nowrap` belongs only to the second mode: with shrink-0 the label
 * cannot be squeezed, so it stays one line and the row scrolls instead. Applying
 * it in the two-up mode would spill long labels over the neighbouring option
 * rather than wrapping them.
 */
export function ToggleGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  ariaLabel,
}: Props<T>) {
  // Two options keep the mock's geometry; denser rows size to content and scroll.
  const roomy = options.length <= 2;
  return (
    <div className="flex flex-col">
      {label && <span className="py-2.5 text-body-s text-content">{label}</span>}
      <div
        role="tablist"
        aria-label={ariaLabel ?? label}
        className={`flex items-stretch ${roomy ? 'gap-4' : 'gap-[10px] overflow-x-auto'}`}
      >
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onChange(o.value)}
              className={`flex-1 rounded-[14px] py-2.5 text-center text-h3 ${
                roomy
                  ? 'min-w-0 basis-0 px-[22px]'
                  : 'shrink-0 basis-auto whitespace-nowrap px-[14px]'
              } ${selected ? 'bg-brand-400 text-neutral-50' : 'bg-card-light text-content'}`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
