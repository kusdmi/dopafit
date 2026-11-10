import { readFileSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type PluginOption } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Версия приложения живёт в одном месте — package.json. Экран настроек
// показывает её как фолбэк, когда нативный App.getInfo() недоступен (web).
const { version: appVersion } = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'),
) as { version: string };

// `public/mockServiceWorker.js` is MSW's own worker script, generated there by
// `msw init` (see the "msw".workerDirectory field in package.json) and committed
// so the dev server can serve it. Vite copies everything in `public/` into
// `dist/` verbatim, which shipped 9 kB of dev-only code to production — and the
// PWA then precached it, so every user downloaded it on install.
//
// Deleting the copy from `dist/` rather than moving the source file is
// deliberate: MSW looks for its worker at the server root
// (`/mockServiceWorker.js`), so it has to live in `public/`, and
// `apply: 'build'` leaves the dev server serving it exactly as before.
//
// The hook has to be `closeBundle`, not `generateBundle`: files in `public/` are
// copied to `dist/` by a plain filesystem copy and never enter the rollup
// bundle, so there is no asset there to drop. `enforce: 'post'` puts this
// `closeBundle` after vite-plugin-pwa's, which is where the service worker is
// generated — deleting earlier would race the SW build. The precache manifest is
// handled independently by the `globIgnores` entry below, so the file is out of
// the manifest even on a stale `dist/` this hook never touched.
const MSW_WORKER_FILE = 'mockServiceWorker.js';

function dropMswWorkerFromBuild(): PluginOption {
  let outDir = 'dist';
  return {
    name: 'dopafit:drop-msw-worker',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      outDir = config.build.outDir;
      // The SW's own second build writes into the same outDir; only the client
      // build copies `public/`, but deleting twice is harmless either way.
    },
    closeBundle() {
      rmSync(fileURLToPath(new URL(`./${outDir}/${MSW_WORKER_FILE}`, import.meta.url)), {
        force: true,
      });
    },
  };
}

export default defineConfig(({ mode, command }) => {
  const buildId = command === 'build' ? randomUUID() : 'development';
  // Берём VITE_TARGET из shell env ИЛИ из .env.[mode] (vite не кладёт их в process.env).
  const env = loadEnv(mode, process.cwd(), '');

  // Build-time guard: a missing VITE_API_URL silently falls back to the localhost
  // default in env.ts — that's exactly the bug that shipped "offline mode" in the
  // Android APK. Fail loud on every `vite build` so the wrong URL can never be
  // baked in. Dev-server (`vite serve`) is intentionally excluded.
  if (command === 'build' && (process.env.VITE_TARGET ?? env.VITE_TARGET) === 'native') {
    const apiUrl = process.env.VITE_API_URL ?? env.VITE_API_URL;
    if (!apiUrl || !/^https?:\/\//.test(apiUrl)) {
      throw new Error(
        '[vite.config] VITE_API_URL is not set — refusing to build.\n' +
          '\n' +
          '  For a native dev build on a real device:\n' +
          '    cp frontend/.env.native.local.example frontend/.env.native.local\n' +
          '    # then set your LAN IP (ipconfig getifaddr en0) in .env.native.local\n' +
          '\n' +
          '  For a production build:\n' +
          '    VITE_API_URL=https://api.dopafit.ru pnpm build:native\n' +
          '\n' +
          '  For CI / Makefile:\n' +
          '    VITE_API_URL=https://api.ci.invalid pnpm build\n',
      );
    }
  }
  const target = process.env.VITE_TARGET ?? env.VITE_TARGET;
  // Service worker только в PWA-сборке; в native (Capacitor WebView) SW отключён.
  const isPwa = target !== 'native';

  // Опциональный HTTPS для `vite preview` — чтобы проверить PWA (SW + установку) на телефоне
  // по https://<LAN-IP> с локальным сертификатом (mkcert). Vite 8 убрал CLI-флаг --https,
  // поэтому пути к cert/key передаём через env. Не заданы → preview по HTTP, как обычно.
  // См. docs/DEVELOPMENT.md §11.3.
  const previewCert = process.env.PREVIEW_HTTPS_CERT;
  const previewKey = process.env.PREVIEW_HTTPS_KEY;
  const previewHttps =
    previewCert && previewKey
      ? { cert: readFileSync(previewCert), key: readFileSync(previewKey) }
      : undefined;

  // Контур e2e поднимает свой backend с отдельной базой; dev-значение остаётся
  // дефолтом. Без переопределения frontend-e2e проксировал бы в dev-backend, и
  // изоляции не возникло бы — причём молча, по рабочей с виду странице.
  const apiProxyTarget = process.env.VITE_DEV_API_PROXY ?? 'http://backend:8000';

  // Имена сервисов, по которым dev-сервер доступен внутри docker-сети. Задаются
  // переменной, чтобы список жил рядом с compose, а не был вшит в конфиг.
  const devHosts = (process.env.VITE_DEV_ALLOWED_HOSTS ?? 'frontend,frontend-e2e').split(',');

  return {
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
      __APP_BUILD_ID__: JSON.stringify(buildId),
    },
    plugins: [
      react(),
      tailwindcss(),
      dropMswWorkerFromBuild(),
      {
        name: 'dopafit:release-manifest',
        apply: 'build',
        generateBundle() {
          this.emitFile({
            type: 'asset',
            fileName: 'version.json',
            source: JSON.stringify({ buildId }),
          });
        },
      },
      {
        name: 'dopafit:strip-html-comments',
        apply: 'build',
        transformIndexHtml: {
          order: 'post',
          handler: (html) =>
            html.replace(/<!--[^]*?-->|<(script|style)\b[^>]*>[^]*?<\/\1\s*>/gi, (part) =>
              part.startsWith('<!--') ? '' : part,
            ),
        },
      },
      ...(isPwa
        ? [
            VitePWA({
              registerType: 'prompt',
              injectRegister: false,
              strategies: 'injectManifest',
              srcDir: 'src',
              filename: 'sw.ts',
              // Belt to the plugin above: even if MSW's dev worker ever reaches
              // `dist/` again (a stale output directory, a future change to how
              // `public/` is copied), it must not enter the install-time
              // precache — it is dev-only code no production user ever runs.
              injectManifest: {
                globIgnores: ['**/node_modules/**/*', MSW_WORKER_FILE, '**/version.json'],
              },
              includeAssets: [
                'icon.svg',
                'icons/apple-touch-icon.png',
                'icons/favicon-32x32.png',
                'icons/favicon-16x16.png',
              ],
              manifest: {
                name: 'DopaFit',
                short_name: 'DopaFit',
                // Приложение русскоязычное, а плагин по умолчанию ставит 'en'
                // — как и <html lang="ru"> в index.html.
                lang: 'ru',
                // Манифест статичен: одно значение на обе темы, второго
                // задать нельзя. Кладём тёмное — это тема по умолчанию в CSS
                // (bare `:root`), и оно совпадает с index.html.
                //
                // theme_color здесь — только запасной вариант: он действует до
                // того, как загрузится JS, и на Android в списке недавних
                // приложений. В самом окне его сразу перекрывает
                // `<meta name="theme-color">`, который applyTheme() держит в
                // соответствии с выбранной темой, так что расхождение
                // манифеста с темой видно лишь на время первой краски.
                //
                // Оба значения — верхняя точка --gradient-primary, а не
                // --surface: под статус-баром и на сплеше виден верх градиента
                // (см. shared/lib/theme/surface.ts). Прежний background_color
                // #161412 (--surface) давал сплеш на оттенок холоднее, чем
                // экран, который открывался следом.
                theme_color: '#1E1208',
                background_color: '#1E1208',
                display: 'standalone',
                // Preferred orientation for browsers that honor the manifest (e.g. Android).
                // iOS PWA does not guarantee orientation locking; responsive layout is
                // still required. Native builds use their platform project settings.
                orientation: 'portrait',
                icons: [
                  { src: '/icons/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
                  { src: '/icons/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
                  {
                    src: '/icons/maskable-512x512.png',
                    sizes: '512x512',
                    type: 'image/png',
                    purpose: 'maskable',
                  },
                ],
              },
            }),
          ]
        : []),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      host: true,
      port: 5173,
      // Vite пропускает только localhost и LAN-адреса: защита от DNS-rebinding.
      // Браузер e2e приходит по DNS-имени сервиса внутри docker-сети, поэтому
      // без этой строки dev-сервер отвечает ему 403 «host is not allowed».
      allowedHosts: devHosts,
      proxy: { '/api': { target: apiProxyTarget, changeOrigin: true } },
    },
    preview: {
      host: true,
      port: 4173,
      allowedHosts: devHosts,
      proxy: { '/api': { target: apiProxyTarget, changeOrigin: true } },
      ...(previewHttps ? { https: previewHttps } : {}),
    },
  };
});
