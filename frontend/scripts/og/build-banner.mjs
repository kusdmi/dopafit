// Сборка OG-баннера: og-banner.svg -> public/icons/og-banner.png.
//
// Зачем скрипт, а не «нарисовал один раз руками»: баннер — часть бренда, его
// придётся переделывать (сменится логотип, цвета, домен). Исходник лежит рядом
// в SVG: он версионируется и правится текстом, а PNG пересобирается командой.
//
// Запускать только в контейнере (правило проекта — Docker-only):
//   make fe-og-banner
//
// Почему sharp резолвится по пути из .pnpm, а не обычным `import 'sharp'`:
// sharp не объявлен зависимостью фронтенда — он приезжает транзитивно вместе с
// @capacitor/assets, поэтому в node_modules воркспейса его нет. Ради одной
// картинки заводить тяжёлую прямую зависимость не стали; если sharp пропадёт
// из дерева, скрипт честно упадёт с понятным сообщением, а не молча.
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

const SRC = join(here, 'og-banner.svg');
const OUT = join(root, 'public', 'icons', 'og-banner.png');

/** Ищем sharp в pnpm-сторе: точная версия в пути меняется при обновлении. */
function loadSharp() {
  const require = createRequire(import.meta.url);
  const store = join(root, '..', 'node_modules', '.pnpm');
  const dir = readdirSync(store)
    .filter((name) => name.startsWith('sharp@'))
    .sort()
    .pop();
  if (!dir) {
    throw new Error(
      'sharp не найден в node_modules/.pnpm. Он приходит транзитивно с ' +
        '@capacitor/assets — проверьте, что зависимости установлены (make deps).',
    );
  }
  return require(join(store, dir, 'node_modules', 'sharp'));
}

const sharp = loadSharp();

// flatten обязателен: в SVG есть полупрозрачная подсветка, и без него PNG
// уезжает с альфа-каналом. Часть площадок кладёт прозрачность на БЕЛЫЙ фон —
// тёмный баннер после такого превращается в кашу. Фон — верхняя точка
// градиента приложения, тот же #1E1208, что в theme-color и манифесте.
const { width, height, size } = await sharp(readFileSync(SRC))
  .flatten({ background: '#1E1208' })
  .png({ compressionLevel: 9 })
  .toFile(OUT);

console.log(`og-banner.png: ${width}x${height}, ${size} bytes`);
