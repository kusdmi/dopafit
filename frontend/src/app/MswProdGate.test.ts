import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * MSW НЕ ДОЛЖЕН ПОПАДАТЬ В ПРОД-БАНДЛ.
 *
 * Раньше мок включался одним рантайм-условием (`if (!env.apiMock) return`), где
 * `env.apiMock` читается из `import.meta.env.VITE_API_MOCK`. Для сборщика такое
 * условие непрозрачно: доказать, что ветка мертва, он не может, поэтому
 * `import('@/app/mocks/browser')` оставался живым и чанк MSW (450 кБ raw /
 * 166 кБ gzip) эмитился ВСЕГДА и уходил в install-time precache сервис-воркера —
 * около 40% установочного трафика PWA было мёртвым dev-кодом.
 *
 * Лечится тем, что условие начинается с `import.meta.env.DEV` — build-time
 * литерала, который в прод-сборке становится `false` и делает ветку статически
 * недостижимой.
 *
 * ПОЧЕМУ ТЕСТ ЧИТАЕТ ИСХОДНИК, А НЕ ВЫЗЫВАЕТ КОД. Проверяемый инвариант —
 * свойство СБОРКИ (tree-shaking), а не поведения: в рантайме обе версии
 * `enableMocking()` ведут себя одинаково, отличается только то, попал ли чанк в
 * dist. Наблюдать это из vitest нельзя (там свой конфиг и DEV=true), а гонять
 * полный `vite build` внутри юнит-теста — минуты на прогон. Поэтому стережём
 * ровно ту текстовую форму условия, от которой зависит сборщик.
 */
const mainSource = readFileSync(resolve(process.cwd(), 'src/main.tsx'), 'utf8');

describe('прод-гейт MSW в main.tsx', () => {
  it('гейтит импорт мока build-time литералом import.meta.env.DEV', () => {
    // Комментарии режем: рядом с условием DEV упомянут в объяснении, и без
    // этого тест прошёл бы на одном тексте комментария.
    const code = mainSource.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

    // Динамический импорт мока обязан стоять ПОСЛЕ проверки DEV в том же
    // потоке управления — иначе сборщику нечего вырезать.
    const devGate = code.indexOf('import.meta.env.DEV');
    const mockImport = code.indexOf("import('@/app/mocks/browser')");
    expect(devGate).toBeGreaterThanOrEqual(0);
    expect(mockImport).toBeGreaterThan(devGate);

    // Рантайм-флаг никуда не делся: в dev по-прежнему решает VITE_API_MOCK,
    // иначе правка «починила» бы прод, сломав локальную разработку на моках.
    expect(code).toContain('env.apiMock');
  });

  it('не проверяет apiMock раньше DEV', () => {
    // Порядок в `&&`/`||` — это и есть то, от чего зависит tree-shaking:
    // с рантайм-значением впереди сборщик не может признать ветку мёртвой,
    // и чанк MSW снова начнёт эмититься, хотя код внешне выглядит верным.
    const code = mainSource.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code.indexOf('import.meta.env.DEV')).toBeLessThan(code.indexOf('env.apiMock'));
  });
});
