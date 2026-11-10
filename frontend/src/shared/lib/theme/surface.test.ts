import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  CHROME_DARK,
  CHROME_LIGHT,
  SURFACE_DARK,
  SURFACE_LIGHT,
  chromeColor,
  surfaceColor,
} from './surface';

// Сам файл темы, как текст: сверяем константы с первоисточником, а не с копией.
// Через `?raw` нельзя — в тестовом окружении CSS-импорты заглушены пустой
// строкой; vitest запускается из корня пакета frontend, поэтому путь от него.
const css = readFileSync(join(process.cwd(), 'src/app/styles/index.css'), 'utf8');

/**
 * Значение `--surface` из блока темы в index.css.
 *
 * Токен объявлен как `--surface: var(--neutral-N)`, поэтому берём его в два
 * шага: сначала имя переменной из блока темы, затем hex этой ступени из
 * нейтральной шкалы в `:root`.
 */
function surfaceFromCss(css: string, selector: string): string {
  const block = css.slice(css.indexOf(selector));
  const body = block.slice(block.indexOf('{'), block.indexOf('}'));
  const alias = /--surface:\s*var\((--neutral-\d+)\)/.exec(body);
  expect(alias, `не нашли --surface в блоке ${selector}`).not.toBeNull();

  const step = new RegExp(`\\${alias![1]}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  expect(step, `не нашли ступень ${alias![1]} в нейтральной шкале`).not.toBeNull();
  return step![1].toLowerCase();
}

/**
 * First colour stop of `--gradient-primary` in a theme block — the band that
 * actually shows under the status bar, since every screen paints the gradient
 * and the header only pads past the safe-area inset.
 */
function gradientTopFromCss(css: string, selector: string): string {
  const block = css.slice(css.indexOf(selector));
  const body = block.slice(block.indexOf('{'), block.indexOf('}'));
  expect(body).toMatch(/--gradient-primary:\s*linear-gradient\([^,]+,\s*var\(--chrome-bg\)/);
  const stop = /--chrome-bg:\s*(#[0-9a-fA-F]{6})/.exec(body);
  expect(stop, `не нашли --chrome-bg в блоке ${selector}`).not.toBeNull();
  return stop![1].toLowerCase();
}

// Константы существуют, потому что нативное окружение (статус-бар, панель
// навигации, сплеш) не умеет читать CSS-переменные — удалить их нельзя. Но до
// сих пор их совпадение с index.css держалось на одном комментарии: правка
// токена в CSS молча расходилась бы с нативным хромом. Тест делает инвариант
// проверяемым.
describe('surface constants', () => {
  it('matches the light --surface token in index.css', () => {
    expect(SURFACE_LIGHT.toLowerCase()).toBe(surfaceFromCss(css, ":root[data-theme='light']"));
  });

  it('matches the dark --surface token in index.css', () => {
    expect(SURFACE_DARK.toLowerCase()).toBe(surfaceFromCss(css, ":root[data-theme='dark']"));
  });

  it('picks the surface for the active theme', () => {
    expect(surfaceColor(true)).toBe(SURFACE_DARK);
    expect(surfaceColor(false)).toBe(SURFACE_LIGHT);
  });
});

// Статус-бар и `<meta name="theme-color">` красятся в CHROME_*, а не в
// SURFACE_*: под статус-баром видна верхняя точка градиента (все экраны —
// `<Page background="gradient">`). Тот же инвариант, та же защита от дрейфа.
describe('chrome constants', () => {
  it('matches the light gradient top stop in index.css', () => {
    expect(CHROME_LIGHT.toLowerCase()).toBe(gradientTopFromCss(css, ":root[data-theme='light']"));
  });

  it('matches the dark gradient top stop in index.css', () => {
    expect(CHROME_DARK.toLowerCase()).toBe(gradientTopFromCss(css, ":root[data-theme='dark']"));
  });

  it('picks the chrome colour for the active theme', () => {
    expect(chromeColor(true)).toBe(CHROME_DARK);
    expect(chromeColor(false)).toBe(CHROME_LIGHT);
  });
});
