import { beforeEach, describe, expect, it } from 'vitest';

import { CHROME_DARK, CHROME_LIGHT } from './surface';
import { applyTheme } from './theme';

function metas() {
  return [...document.head.querySelectorAll('meta[name="theme-color"]')];
}

function content() {
  const tags = metas();
  expect(tags, 'ожидали ровно один meta[name="theme-color"]').toHaveLength(1);
  return tags[0].getAttribute('content');
}

/**
 * Регрессия на расхождение статус-бара с фоном в установленной PWA.
 *
 * index.html раньше отдавал ДВА тега, разделённых `media="(prefers-color-scheme)"`,
 * то есть по СИСТЕМНОЙ теме. Тему в приложении выбирают вручную на экране
 * «Оформление», поэтому при светлой системе и тёмной теме в приложении браузер
 * брал светлый тег — статус-бар вставал светлым поверх тёмного экрана.
 */
describe('theme-color follows the in-app theme', () => {
  beforeEach(() => {
    document.head.querySelectorAll('meta[name="theme-color"]').forEach((tag) => tag.remove());
  });

  it('красит chrome под выбранную тему, а не под системную', () => {
    // Система светлая; в приложении выбрана тёмная — раньше выигрывала система.
    window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as never;

    applyTheme('dark');
    expect(content()).toBe(CHROME_DARK);

    applyTheme('light');
    expect(content()).toBe(CHROME_LIGHT);
  });

  it('под pref=system идёт за схемой ОС', () => {
    window.matchMedia = ((query: string) => ({
      matches: query.includes('dark'),
      addEventListener() {},
      removeEventListener() {},
    })) as never;

    applyTheme('system');
    expect(content()).toBe(CHROME_DARK);
  });

  it('схлопывает media-теги из index.html в один безусловный', () => {
    for (const scheme of ['dark', 'light']) {
      const tag = document.createElement('meta');
      tag.setAttribute('name', 'theme-color');
      tag.setAttribute('media', `(prefers-color-scheme: ${scheme})`);
      document.head.appendChild(tag);
    }
    window.matchMedia = (() => ({ matches: true, addEventListener() {}, removeEventListener() {} })) as never;

    applyTheme('dark');
    // Браузер берёт первый тег с подходящим media — оставшийся media-тег мог бы
    // снова отдать управление системе, поэтому дубли удаляются.
    expect(metas()).toHaveLength(1);
    expect(metas()[0].hasAttribute('media')).toBe(false);
    expect(content()).toBe(CHROME_DARK);
  });
});
