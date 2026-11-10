import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { paths } from '@/shared/config/paths';

import { AppTabBar } from './BottomNav';

// Стережёт два инварианта: доступность (nav получает имя, активная вкладка
// различима не только цветом) и сохранение названий вкладок
// (RouteResolution.test.tsx полагается на те же лейблы).
describe('AppTabBar', () => {
  // Подписей в разметке больше нет — макет 392:2229 рисует только плитки, —
  // поэтому имена вкладок живут в aria-label. Доступное имя ссылки от этого не
  // изменилось, и тест намеренно ищет по нему: если подписи когда-нибудь
  // вернут текстом, этот тест продолжит проходить, а вот молчаливая потеря
  // имени вкладки его уронит.
  it('exposes an accessible navigation landmark with all five tabs', () => {
    render(
      <MemoryRouter initialEntries={[paths.home]}>
        <AppTabBar />
      </MemoryRouter>,
    );
    const nav = screen.getByRole('navigation', { name: 'Основная навигация' });
    expect(nav).toBeInTheDocument();
    for (const label of ['Главная', 'Замеры', 'Тренировка', 'Аналитика', 'Настройки']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
  });

  it('keeps the tab names out of the visible text, as in the design', () => {
    render(
      <MemoryRouter initialEntries={[paths.home]}>
        <AppTabBar />
      </MemoryRouter>,
    );
    // Имя вкладки доступно, но не нарисовано: у ссылки нет текстового узла.
    expect(screen.getByRole('link', { name: 'Главная' })).toHaveTextContent('');
  });

  it('marks the active tab with aria-current, not color alone', () => {
    render(
      <MemoryRouter initialEntries={[paths.measurements]}>
        <AppTabBar />
      </MemoryRouter>,
    );
    const active = screen.getByRole('link', { name: 'Замеры' });
    expect(active).toHaveAttribute('aria-current', 'page');
    expect(active.className).toMatch(/bottom-nav__link--active/);

    const inactive = screen.getByRole('link', { name: 'Главная' });
    expect(inactive).not.toHaveAttribute('aria-current');
    expect(inactive.className).not.toMatch(/bottom-nav__link--active/);
  });

  // Видимая плашка — отдельный элемент внутри .bottom-nav: внешний слой держит
  // поля (бар не прижат к краям), а фон и скругление живут на .bottom-nav__bar.
  // Если их снова слить в один элемент, поля станут частью плашки и бар
  // растянется на всю ширину экрана.
  it('separates the positioning layer from the visible bar', () => {
    const { container } = render(
      <MemoryRouter initialEntries={[paths.home]}>
        <AppTabBar />
      </MemoryRouter>,
    );
    expect(container.querySelector('.bottom-nav > .bottom-nav__bar')).not.toBeNull();
  });

  it('renders a glyph tile per tab', () => {
    const { container } = render(
      <MemoryRouter initialEntries={[paths.home]}>
        <AppTabBar />
      </MemoryRouter>,
    );
    expect(container.querySelectorAll('.bottom-nav__icon svg')).toHaveLength(5);
  });
});
