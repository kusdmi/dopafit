import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Теги превью живут в index.html, а не в React: краулеры соцсетей не выполняют
 * JS, поэтому проверять их можно только чтением самого файла.
 *
 * Тест закрывает ровно то, что уже ломалось: домен-заглушку и настройки,
 * без которых карточка молча деградирует до «без картинки» или до узкой.
 *
 * Путь — от cwd, а не от import.meta.url: окружение тестов jsdom, и
 * import.meta.url там http-, а не file-схемы (fileURLToPath на нём падает).
 * vitest запускается из корня пакета frontend, где и лежит index.html.
 */
const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

/** Достаёт content у <meta property=...> или <meta name=...>. */
function meta(key: string): string | undefined {
  const re = new RegExp(`<meta\\s+(?:property|name)="${key}"\\s+content="([^"]*)"`, 'i');
  return html.match(re)?.[1];
}

describe('OG-теги в index.html', () => {
  it('не ссылается на домен-заглушку dopafit.app', () => {
    // `dopafit.app` — заглушка из дефолтов backend/src/config.ts. Приложение
    // её не обслуживает, и краулер уходил за картинкой в никуда: превью
    // оставалось без картинки. Тот же инвариант стережёт ResultCard.test.tsx.
    //
    // Проверяем именно АТРИБУТЫ, а не весь файл: в комментариях рядом с тегами
    // заглушка упомянута нарочно — как история правки, чтобы её не вернули.
    const urls = [...html.matchAll(/(?:content|href)="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.filter((url) => url.includes('dopafit.app'))).toEqual([]);
  });

  it('ссылается на картинку и канонический адрес абсолютным URL рабочего домена', () => {
    // Относительный og:image часть краулеров не разрешает, поэтому именно
    // абсолютный, и именно на домен, который реально отвечает.
    for (const key of ['og:image', 'twitter:image', 'og:url']) {
      expect(meta(key)).toMatch(/^https:\/\/app\.dopafit\.ru\//);
    }
  });

  it('объявляет широкую карточку баннером 1200x630', () => {
    // Без summary_large_image карточка остаётся компактной (значок слева)
    // даже с правильным баннером — размер картинки на это не влияет.
    expect(meta('twitter:card')).toBe('summary_large_image');
    expect(meta('og:image:width')).toBe('1200');
    expect(meta('og:image:height')).toBe('630');
  });

  it('запрещает зум, не потеряв viewport-fit=cover', () => {
    // Запрет масштабирования — требование продукта (нативное поведение).
    // viewport-fit=cover при этом обязателен: на нём держатся safe-area-инсеты,
    // без него верхняя раскладка уезжает под статус-бар.
    const viewport = html.match(/<meta\s+name="viewport"\s+content="([^"]*)"/is)?.[1];
    expect(viewport).toBeDefined();
    expect(viewport).toContain('user-scalable=no');
    expect(viewport).toContain('maximum-scale=1.0');
    expect(viewport).toContain('viewport-fit=cover');
  });

  it('гасит пинч на iOS через gesture-события, а не глобальный touchmove', () => {
    // Safari игнорирует user-scalable=no с iOS 10, поэтому нужен перехват.
    // Глобальный touchmove с preventDefault убил бы вертикальный скролл —
    // проверяем, что его тут нет.
    for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
      expect(html).toContain(type);
    }
    expect(html).not.toMatch(/addEventListener\(\s*['"]touchmove['"]/);
  });

  it('предзагружает кириллический сабсет шрифта по реально существующему пути', () => {
    // Шрифты объявлены внутри CSS-бандла, поэтому без preload браузер узнаёт о
    // файле только после разбора всего CSS. Тег ломается молча: preload на
    // несуществующий путь не даёт ошибки, просто тратит запрос, — поэтому
    // проверяем не только сам тег, но и что файл лежит там, куда он указывает.
    const tag = html.match(/<link\s+rel="preload"[^>]*?\/>/is);
    expect(tag).not.toBeNull();
    const preload = tag![0];
    expect(preload).toMatch(/as="font"/);
    expect(preload).toMatch(/type="font\/woff2"/);
    // crossorigin обязателен: шрифты запрашиваются в режиме CORS, и без него
    // браузер скачал бы файл второй раз — предзагруженная копия не подошла бы.
    expect(preload).toMatch(/crossorigin/);

    const href = preload.match(/href="([^"]+)"/)?.[1];
    expect(href).toBeDefined();
    // Путь без хеша валиден только потому, что шрифты лежат в public/ и Vite
    // копирует их дословно. Если они переедут в src/ и начнут импортироваться
    // из кода, имя станет хешированным — этот assert упадёт первым.
    expect(href).toBe('/fonts/manrope-cyrillic-wght.woff2');
    expect(
      readFileSync(resolve(process.cwd(), 'public', href!.replace(/^\//, ''))).byteLength,
    ).toBeGreaterThan(0);

    // Именно кириллица: приложение русскоязычное, а латинский сабсет на 10 кБ
    // больше и нужен единичным строкам — второй preload конкурировал бы за
    // полосу с тем, что нужно сразу.
    const fontPreloads = [...html.matchAll(/<link\s+rel="preload"[^>]*as="font"[^>]*?\/>/gis)];
    expect(fontPreloads).toHaveLength(1);
  });

  it('не выставляет noindex, иначе часть площадок не строит превью', () => {
    // Индексировать в приложении за логином нечего, но noindex некоторые
    // площадки трактуют как запрет и на карточку — а она нам нужна.
    expect(meta('robots')).toBeUndefined();
  });
});
