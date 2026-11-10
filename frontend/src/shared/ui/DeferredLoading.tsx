import type { ReactNode } from 'react';

import {
  useDelayedVisible,
  type DelayedVisibleOptions,
} from '@/shared/lib/loading/useDelayedVisible';

interface Props extends DelayedVisibleOptions {
  /** Идёт ли загрузка (isLoading/isPending первого запроса). */
  loading: boolean;
  /** Что показывать во время затянувшейся загрузки (скелетон/спиннер). */
  fallback: ReactNode;
  /** Готовый контент. */
  children: ReactNode;
}

/**
 * Плавная замена «loading ? <Skeleton/> : <Content/>».
 *
 * Убирает три частые проблемы:
 *  - вспышку скелетона на мгновенных ответах из кэша (порог `delayMs`);
 *  - мигание скелетона, если он всё же успел показаться (минимум `minVisibleMs`);
 *  - резкое появление контента — оборачиваем его в короткий fade-in.
 *
 * Важно: `fallback` (скелетон) должен совпадать по габаритам с контентом, иначе
 * при переходе будет layout shift. НЕ оборачивай сюда данные, приходящие из кэша
 * мгновенно, — цель именно «не мигать», а не добавить анимацию везде.
 */
export function DeferredLoading({ loading, fallback, children, ...options }: Props) {
  const showFallback = useDelayedVisible(loading, options);

  if (loading) {
    // Пока данных нет: либо держим пусто (до порога delayMs), либо показываем
    // скелетон. Пустой промежуток предотвращает вспышку на быстрых ответах.
    return showFallback ? <>{fallback}</> : null;
  }

  // Данные готовы, но скелетон ещё «досиживает» минимум — не мигаем.
  if (showFallback) {
    return <>{fallback}</>;
  }

  return <div className="animate-fade-in">{children}</div>;
}
