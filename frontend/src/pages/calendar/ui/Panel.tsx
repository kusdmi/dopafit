import type { ReactNode } from 'react';

// Карточка-панель экрана (Figma 392:2856 / 392:4169): прозрачная заливка,
// 1px обводка цветом роли на 50% альфы, радиус 20px. Локальный компонент зоны —
// общие примитивы в shared/ui трогать нельзя, а вне календаря этот паттерн
// (панель на градиенте, а не на --card) пока не встречается.
type PanelAccent = 'brand' | 'trainer';

const PANEL_BORDER: Record<PanelAccent, string> = {
  brand: 'color-mix(in srgb, var(--color-brand-400) 50%, transparent)',
  trainer: 'color-mix(in srgb, var(--color-trainer-400) 50%, transparent)',
};

export function Panel({
  accent = 'brand',
  className = '',
  children,
}: {
  accent?: PanelAccent;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`rounded-[20px] border p-[15px] ${className}`}
      style={{ borderColor: PANEL_BORDER[accent] }}
    >
      {children}
    </div>
  );
}

export function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-[5px] text-center">
      <span className="text-display text-content">{value}</span>
      <span className="text-caption text-content">{label}</span>
    </div>
  );
}
