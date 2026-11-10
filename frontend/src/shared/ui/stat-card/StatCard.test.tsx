import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { flame } from '@/shared/ui/icons';

import { StatCard } from './StatCard';

describe('StatCard', () => {
  it('renders the compact legend layout when no icon is given', () => {
    render(<StatCard title="Ср. вес" value={82} />);
    expect(screen.getByText('Ср. вес')).toBeInTheDocument();
    expect(screen.getByText('82')).toBeInTheDocument();
  });

  it('applies the accent color as the border in the compact layout', () => {
    const { container } = render(
      <StatCard title="Жим лёжа" value="18 кг" accentColor="var(--color-chart-1)" />,
    );
    const card = container.firstElementChild as HTMLElement;
    expect(card.style.borderColor).toBe('var(--color-chart-1)');
  });

  it('renders the colored-card pattern (icon pill) when an icon is provided', () => {
    const { container } = render(
      <StatCard
        title="Серия"
        value={18}
        hint="Тренировок за месяц"
        accentColor="#ff7003"
        icon={flame}
      />,
    );
    const card = container.firstElementChild as HTMLElement;
    expect(card.style.borderColor).toBe('rgb(255, 112, 3)');
    // Icon pill tint is derived from the accent via color-mix, never a
    // hardcoded rgba literal. Match it by the tint itself rather than by
    // position: the pill is wrapped differently once onPick adds the chevron.
    const pill = [...card.querySelectorAll('div')].find((el) =>
      el.style.background.includes('color-mix'),
    );
    expect(pill).toBeDefined();
    // Figma 392:2072: a full-width plate 60px tall, not a glyph-sized circle.
    expect(pill).toHaveClass('h-[60px]');
    expect(screen.getByText('Серия')).toBeInTheDocument();
    expect(screen.getByText('18')).toBeInTheDocument();
    expect(screen.getByText('Тренировок за месяц')).toBeInTheDocument();
  });

  it('turns the icon pill into the picker button when onPick is given', () => {
    render(
      <StatCard
        title="Жим лёжа"
        value="18 кг"
        hint="Личный рекорд"
        icon={flame}
        onPick={() => {}}
        pickLabel="Сменить упражнение"
      />,
    );
    // Figma 392:2083 puts the chevron beside the pill, and the whole row is the
    // affordance — not a separate "Сменить" text button.
    expect(screen.getByRole('button', { name: 'Сменить упражнение' })).toBeInTheDocument();
  });

  // Нажиматься должна вся карточка, а не только строка с плашкой и чевроном:
  // кнопка растягивает псевдоэлемент на весь родитель. Проверяем обе половины
  // контракта — сам растянутый `after` и `relative` на карточке, без которого
  // `after:inset-0` привязался бы к чужому предку и цель уехала бы.
  it('stretches the tap target over the whole card', () => {
    const { container } = render(
      <StatCard
        title="Жим лёжа"
        value="18 кг"
        hint="Личный рекорд"
        icon={flame}
        onPick={() => {}}
        pickLabel="Сменить упражнение"
      />,
    );
    const card = container.firstElementChild as HTMLElement;
    expect(card).toHaveClass('relative');
    const button = screen.getByRole('button', { name: 'Сменить упражнение' });
    expect(button.className).toContain('after:absolute');
    expect(button.className).toContain('after:inset-0');
  });

  it('still supports the onPick affordance in the compact layout', () => {
    render(<StatCard title="Вес" value={80} onPick={() => {}} />);
    expect(screen.getByRole('button', { name: 'Сменить' })).toBeInTheDocument();
  });
});
