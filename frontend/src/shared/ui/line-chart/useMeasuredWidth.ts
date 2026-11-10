import { useLayoutEffect, useState, type RefObject } from 'react';

import { DEFAULT_VIEW_W } from './geometry';

/**
 * Фактическая ширина узла в px — её же ставим в viewBox, поэтому масштаб 1:1 и
 * график тянется на всю ширину карточки без искажений штрихов, точек и текста.
 *
 * Слушаем window 'resize', а не ResizeObserver, ради тестируемости в jsdom.
 */
export function useMeasuredWidth(ref: RefObject<SVGSVGElement | null>): number {
  const [viewW, setViewW] = useState(DEFAULT_VIEW_W);

  useLayoutEffect(() => {
    let raf = 0;
    let tries = 0;
    function measure() {
      // Отменяем ранее запланированный кадр перед измерением: событие 'resize'
      // при width==0 (скрытая вкладка) могло бы завести ВТОРУЮ rAF-цепочку
      // поверх уже летящей. Сбрасывая raf здесь, держим максимум одну цепочку.
      cancelAnimationFrame(raf);
      raf = 0;
      const w = ref.current?.getBoundingClientRect().width ?? 0;
      if (w > 0) {
        // Обновляем только при заметном изменении, чтобы не зацикливать ререндеры.
        setViewW((prev) => (Math.abs(prev - w) > 0.5 ? w : prev));
        return;
      }
      // Страница может быть смонтирована с нулевой шириной (скрытая вкладка),
      // а событие resize при переключении вкладок не приходит. Поэтому, пока ширина
      // равна 0, повторяем измерение через rAF (несколько кадров). В jsdom ширина
      // всегда 0 — после нескольких попыток останавливаемся на дефолте DEFAULT_VIEW_W.
      if (tries < 60) {
        tries += 1;
        raf = requestAnimationFrame(measure);
      }
    }
    measure();
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', measure);
    };
  }, [ref]);

  return viewW;
}
