import type { LucideIcon } from 'lucide-react';

import { chevronDown } from '@/shared/ui/icons';
import { Icon } from '@/shared/ui/primitives';

interface Props {
  label: string;
  open: boolean;
  onToggle: () => void;
  /** Optional glyph before the label (the camera on the photos section). */
  icon?: LucideIcon;
}

// Figma 757:2345 / 758:2346: the collapsible section header is a full-width
// --neutral-600 bar (the `card-light` alias), 36px tall with a 14px radius,
// centring an optional glyph, the label and a chevron that flips when open.
export function SectionToggle({ label, open, onToggle, icon }: Props) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex h-[36px] w-full items-center justify-center gap-[10px] rounded-[14px] bg-card-light px-[10px]"
    >
      {icon && <Icon icon={icon} style={{ fontSize: 21 }} className="text-content" />}
      <span className="text-body-s text-content">{label}</span>
      <Icon
        icon={chevronDown}
        style={{ fontSize: 20 }}
        className={`text-content transition-transform ${open ? 'rotate-180' : ''}`}
      />
    </button>
  );
}
