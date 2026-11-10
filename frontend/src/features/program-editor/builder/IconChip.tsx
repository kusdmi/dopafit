import type { pencilOutline } from '@/shared/ui/icons';
import { Icon } from '@/shared/ui/primitives';

// Круглый чип-кнопка над днём и у упражнения. Размер разный (32px у дня,
// 24px у упражнения), остальное общее.
export function IconChip({
  label,
  icon,
  onClick,
  size = 32,
  tone,
}: {
  label: string;
  icon: typeof pencilOutline;
  onClick: () => void;
  size?: number;
  tone?: 'danger';
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      // Визуальный чип из макета — 24/32px, но тап-таргет должен оставаться
      // доступным (≥44px), поэтому растим область отрицательным внешним
      // отступом, не трогая нарисованный размер.
      className={`-m-2.5 flex min-h-[44px] min-w-[44px] items-center justify-center p-2.5 ${
        tone === 'danger' ? 'text-danger' : 'text-content'
      }`}
    >
      <span
        className="flex items-center justify-center rounded-full bg-card-light"
        style={{ width: size, height: size }}
      >
        <Icon icon={icon} style={{ fontSize: size / 2 }} />
      </span>
    </button>
  );
}
