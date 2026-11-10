import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;
const isPwaRun = process.env.E2E_PWA === '1';

/**
 * The stand is addressed by its compose service name, because the runner lives in
 * the same docker network as the frontend it drives — there is no localhost here.
 */
const baseURL = process.env.E2E_BASE_URL ?? 'http://frontend-e2e:5173';
const pwaOrigin = 'http://localhost:4173';

/**
 * Mobile emulation on Chromium, with the viewport spelled out.
 *
 * Playwright's own phone profiles are not used: the iPhone ones carry
 * `defaultBrowserType: 'webkit'`, and the spec fixes Chromium as the matrix —
 * a second engine would add a variable to every failure. The Android profiles
 * come with their own sizes (Pixel 5 is 393x727), while the spec names exact
 * widths, so the viewport is set here instead of inherited.
 *
 * `isMobile` turns on the mobile viewport meta handling and `hasTouch` replaces
 * mouse events with touch ones; the spec requires both to be in effect.
 */
function mobile(width: number, height: number) {
  return {
    viewport: { width, height },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  };
}

export default defineConfig({
  testDir: './specs',
  // The stand is a single shared backend with one database: parallel workers would
  // mutate each other's accounts and the reset between runs would race them.
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  // A mutation is never retried locally; CI gets one retry so an infrastructure
  // hiccup does not block a pull request, and the retry carries a trace.
  retries: isCI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  reporter: isCI
    ? [
        ['html', { outputFolder: 'playwright-report', open: 'never' }],
        ['json', { outputFile: 'playwright-report/results.json' }],
        ['github'],
      ]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    // Локально трасса пишется всегда: это единственный покадровый просмотр,
    // который даёт Playwright — DOM-снимок на каждое действие (у AUTH-07 это
    // 47 кадров за 1,3 с), сеть и консоль, открывается лентой в `make e2e-report`.
    // Скриншот такого не умеет: режим `on` — один финальный кадр на тест.
    // В CI трасса остаётся только для упавших: ~600 КБ на тест превратились бы на
    // полном наборе в сотни мегабайт артефакта ради зелёного прогона.
    trace: isCI ? 'retain-on-failure' : 'on',
    // Локально кадр сохраняется и для зелёного теста (`test-finished-1.png`, ~70 КБ),
    // чтобы успешный прогон тоже можно было просмотреть глазами в `make e2e-report`:
    // тест проверяет свой оракул, а не вёрстку вокруг него, и пустое имя или уехавшая
    // кнопка на зелёном экране видны только так. В CI остаётся кадр падения: там
    // отчёт читают по упавшему тесту, а артефакт незачем раздувать успешными.
    screenshot: isCI ? 'only-on-failure' : 'on',
    // Video triples the artifact size and the trace already carries a DOM
    // snapshot per action, which debugs a failure better than a film of it.
    video: 'off',
  },
  // A check belongs to one form factor unless it says otherwise: `desktop` runs
  // everything not claimed by a narrower project, and a spec opts into a mobile
  // width with @mobile / @narrow / @large. Running every test on every viewport
  // would multiply a serial suite by four and report the same failure four times.
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
      grepInvert: /@mobile|@narrow|@large|@pwa/,
    },
    // The main mobile form factor, with a real touch input rather than a narrow
    // desktop window: drag-and-drop in the program editor (PROG-07) dispatches
    // touch events, not mouse ones, and behaves differently under them.
    {
      name: 'mobile',
      use: { ...devices['Desktop Chrome'], ...mobile(390, 844) },
      grep: /@mobile/,
      grepInvert: /@pwa/,
    },
    // Targeted WebKit coverage for the iOS shell; other scenarios retain the
    // existing Chromium matrix. Desktop WebKit cannot reproduce iOS chrome.
    {
      name: 'webkit-viewport',
      use: { browserName: 'webkit', ...mobile(390, 844) },
      grep: /UI-08|UI-10|UI-11|UI-12/,
    },
    // Two edge widths, for the checks that name them (PROG-16, UI-03): the
    // narrowest phone still in use, and a large one whose extra height changes
    // what the on-screen keyboard overlaps.
    {
      name: 'narrow',
      use: { ...devices['Desktop Chrome'], ...mobile(320, 700) },
      grep: /@narrow/,
      grepInvert: /@pwa/,
    },
    {
      name: 'large',
      use: { ...devices['Desktop Chrome'], ...mobile(430, 932) },
      grep: /@large/,
      grepInvert: /@pwa/,
    },
    // An ordinary e2e run never selects a project that needs the production
    // preview. Only `make e2e-pwa` opts in by setting E2E_PWA=1.
    ...(isPwaRun
      ? [
          {
            name: 'pwa',
            grep: /@pwa/,
            use: {
              ...devices['Desktop Chrome'],
              baseURL: pwaOrigin,
              viewport: { width: 1440, height: 900 },
              serviceWorkers: 'allow' as const,
            },
          },
        ]
      : []),
  ],
});
