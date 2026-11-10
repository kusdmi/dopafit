import { useEffect, useRef, useState } from 'react';

export interface DelayedVisibleOptions {
  /**
   * Не показывать индикатор, если загрузка завершилась быстрее этого порога
   * (мс). Устраняет «вспышку» скелетона на мгновенных ответах из кэша.
   */
  delayMs?: number;
  /**
   * Если индикатор всё же показан — держать его минимум столько (мс), чтобы
   * он не мигал (появился и тут же исчез). Отсчитывается от момента появления.
   */
  minVisibleMs?: number;
}

const DEFAULT_DELAY_MS = 200;
const DEFAULT_MIN_VISIBLE_MS = 450;

/**
 * Сглаживает показ загрузочного индикатора (скелетон/спиннер/пустое состояние):
 *
 *  - пока `loading === true`, но прошло меньше `delayMs` — возвращает `false`
 *    (ничего не показываем, ждём — вдруг данные придут мгновенно из кэша);
 *  - если загрузка затянулась дольше `delayMs` — возвращает `true`;
 *  - когда `loading` станет `false`, но индикатор УЖЕ показан меньше
 *    `minVisibleMs` — держим `true` до истечения минимума, чтобы не мигать.
 *
 * Возвращает единственный флаг «показывать ли индикатор». Разметка контента и
 * скелетона должна совпадать по габаритам, чтобы не было layout shift.
 */
export function useDelayedVisible(
  loading: boolean,
  { delayMs = DEFAULT_DELAY_MS, minVisibleMs = DEFAULT_MIN_VISIBLE_MS }: DelayedVisibleOptions = {},
): boolean {
  const [visible, setVisible] = useState(false);
  // Момент, когда индикатор реально стал видимым — чтобы выдержать minVisibleMs.
  const shownAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (loading) {
      if (visible) return;
      // Ждём delayMs прежде чем показать — быстрые ответы индикатор не увидят.
      const id = setTimeout(() => {
        shownAtRef.current = Date.now();
        setVisible(true);
      }, delayMs);
      return () => clearTimeout(id);
    }

    // loading стало false
    if (!visible) return;
    const shownFor = shownAtRef.current == null ? 0 : Date.now() - shownAtRef.current;
    // Держим индикатор до истечения минимума; если минимум уже вышел — гасим на
    // следующем тике (setTimeout 0), а не синхронно в эффекте (cascading render).
    const remaining = Math.max(0, minVisibleMs - shownFor);
    const id = setTimeout(() => {
      shownAtRef.current = null;
      setVisible(false);
    }, remaining);
    return () => clearTimeout(id);
  }, [loading, visible, delayMs, minVisibleMs]);

  return visible;
}
