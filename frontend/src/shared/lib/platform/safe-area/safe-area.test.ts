import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { trackSafeAreaBottom } from './safe-area';

/**
 * jsdom не умеет env(), поэтому инсет подменяем высотой пробника: трекер
 * читает её через getBoundingClientRect, и это ровно та точка, которую нужно
 * проверить — как он реагирует на «инсет приехал позже».
 */
function mockInset(sequence: number[]) {
  let i = 0;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
    const height = sequence[Math.min(i, sequence.length - 1)] ?? 0;
    i += 1;
    return { height } as DOMRect;
  });
}

describe('trackSafeAreaBottom', () => {
  beforeEach(() => {
    document.documentElement.style.removeProperty('--safe-area-bottom');
  });
  afterEach(() => vi.restoreAllMocks());

  const read = () => document.documentElement.style.getPropertyValue('--safe-area-bottom');

  it('publishes the inset once it is non-zero', () => {
    mockInset([34]);
    const stop = trackSafeAreaBottom();
    expect(read()).toBe('34px');
    stop();
  });

  // Главный случай: на первом кадре WKWebView отдаёт 0, значение приезжает позже.
  it('picks the inset up when it only arrives after the first frame', async () => {
    mockInset([0, 34]);
    const stop = trackSafeAreaBottom();
    expect(read()).toBe('');

    window.dispatchEvent(new Event('resize'));

    expect(read()).toBe('34px');
    stop();
  });

  // Клавиатура укорачивает WebView, и инсет честно становится нулевым.
  // Следовать за нулём нельзя — резерв схлопнется и контент прыгнет.
  it('ignores a zero inset (the keyboard is up)', () => {
    mockInset([34, 0, 0]);
    const stop = trackSafeAreaBottom();
    expect(read()).toBe('34px');

    window.dispatchEvent(new Event('resize'));

    expect(read()).toBe('34px');
    stop();
  });

  // Главный случай запуска: WKWebView сперва отдаёт ЗАВЫШЕННЫЙ инсет и уточняет
  // его через несколько кадров. Раньше трекер держал максимум и навсегда
  // замораживал завышенное значение — бар висел выше своего места.
  it('follows the inset down when the first value was too large', () => {
    mockInset([46, 34]);
    const stop = trackSafeAreaBottom();
    expect(read()).toBe('46px');

    window.dispatchEvent(new Event('resize'));

    expect(read()).toBe('34px');
    stop();
  });

  it('stops listening after the returned cleanup', () => {
    mockInset([0, 34]);
    const stop = trackSafeAreaBottom();
    stop();

    window.dispatchEvent(new Event('resize'));

    expect(read()).toBe('');
  });
});
