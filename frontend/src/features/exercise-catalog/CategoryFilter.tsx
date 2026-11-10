import type { components } from '@/shared/api/schema';

type CategoryOut = components['schemas']['CategoryOut'];

interface Props {
  categories: CategoryOut[];
  selected: string | null;
  onSelect: (id: string | null) => void;
}

// Keep the 44px hit area independent from the outlined pill. The scrolling row
// reserves vertical room for the border and focus ring, including in WebKit.
const CHIP_BASE = 'flex min-h-[44px] shrink-0 items-center';
const CHIP_PILL = 'rounded-[14px] border px-[10px] py-[5px] text-tag transition-colors';
const CHIP_ACTIVE = 'border-brand-400 text-brand-text';
const CHIP_INACTIVE = 'border-neutral-300 text-content';

export function CategoryFilter({ categories, selected, onSelect }: Props) {
  const allActive = selected === null;
  return (
    <div className="flex shrink-0 items-center gap-[5px] overflow-x-auto py-[5px]">
      <button
        aria-pressed={allActive}
        type="button"
        onClick={() => onSelect(null)}
        data-active={allActive}
        className={CHIP_BASE}
      >
        <span className={`${CHIP_PILL} ${allActive ? CHIP_ACTIVE : CHIP_INACTIVE}`}>Все</span>
      </button>
      {categories.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onSelect(c.id)}
          aria-pressed={selected === c.id}
          data-active={selected === c.id}
          className={CHIP_BASE}
        >
          <span className={`${CHIP_PILL} ${selected === c.id ? CHIP_ACTIVE : CHIP_INACTIVE}`}>
            {c.name} ({c.exercise_count})
          </span>
        </button>
      ))}
    </div>
  );
}
