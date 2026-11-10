import { useContext } from 'react';
import { TabContext } from '@/app/navigation/tab-context';
import { tabForPath } from '@/app/navigation/tabs';
import { Link, useLocation } from 'react-router-dom';
import { paths } from '@/shared/config/paths';

import { AnalyticsGlyph, HomeGlyph, MeasurementsGlyph, MenuGlyph, WorkoutGlyph } from './glyphs';

/**
 * Пять вкладок макета `392:2229`, слева направо. Подписи в разметке НЕ
 * выводятся (в макете их нет) — они уходят в `aria-label`, поэтому доступное
 * имя ссылки остаётся прежним, и скринридер по-прежнему называет вкладку.
 *
 * Пятая вкладка — гамбургер: в макете нарисован именно он, но ведёт вкладка
 * по-прежнему на «Настройки». Отдельного экрана-меню в приложении нет, а
 * страница настроек и так собирает «всё остальное» (подписка, связи,
 * поддержка, тема), так что знак не обманывает.
 */
const items = [
  [paths.home, 'Главная', HomeGlyph],
  [paths.measurements, 'Замеры', MeasurementsGlyph],
  [paths.programs, 'Тренировка', WorkoutGlyph],
  [paths.analytics, 'Аналитика', AnalyticsGlyph],
  [paths.settings, 'Настройки', MenuGlyph],
] as const;

export function AppTabBar() {
  const tabs = useContext(TabContext);
  const location = useLocation();
  const active = tabs?.active ?? tabForPath(location.pathname);
  return (
    <nav aria-label="Основная навигация" className="bottom-nav ym-show-content">
      <div className="bottom-nav__bar">
        {items.map(([to, label, Glyph]) => (
          <Link
            key={to}
            to={tabs?.destinations[to] ?? to}
            aria-current={active === to ? 'page' : undefined}
            onClick={(event) => {
              if (
                tabs &&
                !event.metaKey &&
                !event.ctrlKey &&
                !event.shiftKey &&
                !event.altKey &&
                event.button === 0
              ) {
                event.preventDefault();
                tabs.select(to);
              }
            }}
            aria-label={label}
            className={`bottom-nav__link ${active === to ? 'bottom-nav__link--active' : ''}`}
          >
            <span className="bottom-nav__icon">
              <Glyph />
            </span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
