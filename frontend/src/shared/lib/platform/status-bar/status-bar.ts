import { Capacitor } from '@capacitor/core';

import { chromeColor } from '@/shared/lib/theme/surface';
import { env } from '@/shared/config/env';

/**
 * Цвета системных полос (статус-бар сверху + navigation-bar снизу) на Android
 * берутся из единого источника правды frontend/src/shared/lib/theme/surface.ts.
 *
 * Берём именно CHROME_* (первая точка `--gradient-primary`), а НЕ SURFACE_*.
 * Каждый экран приложения — `<Page background="gradient">`, а `.page-header`
 * отступает на `env(safe-area-inset-top)`, а не закрывает эту полосу: под
 * статус-баром видна верхняя точка градиента, а не плоская заливка `--surface`.
 * Под `--surface` полосы дали бы видимый стык (#161412 к #1e1208 в тёмной теме,
 * #fafaf8 к #fdf6ef в светлой).
 *
 * ВНИМАНИЕ (риск дрейфа): значения в surface.ts ОБЯЗАНЫ совпадать с
 * frontend/src/app/styles/index.css:
 *   LIGHT  --surface: #fafaf8   первая точка --gradient-primary: #fdf6ef
 *   DARK   --surface: #161412   первая точка --gradient-primary: #1e1208
 * Меняешь палитру в CSS — поменяй и в surface.ts (это проверяет surface.test.ts).
 */

/**
 * Синхронизировать стиль и цвет системных полос (статус-бар + navigation-bar)
 * с темой приложения, чтобы они сливались с фоном экрана (верх градиента).
 *
 * Стратегия:
 * - Стиль иконок/кнопок (оба бара, все платформы):
 *     Capacitor StatusBar.Style.Light = СВЕТЛЫЙ фон → тёмный контент,
 *     Style.Dark = ТЁМНЫЙ фон → светлый контент.
 *   isDark → Dark (светлые иконки); !isDark → Light (тёмные иконки).
 *   Для navigation-bar плагина это `darkButtons: !isDark`.
 * - Android: красим фон статус-бара и navigation-bar напрямую под верх градиента.
 *   На Android 15+ (targetSdk 35+) это работает только потому, что мы отказались
 *   от принудительного edge-to-edge флагом android:windowOptOutEdgeToEdgeEnforcement
 *   =true в android/app/src/main/res/values/styles.xml — иначе setBackgroundColor/
 *   setNavigationBarColor стали бы no-op.
 * - iOS: статус-бар прозрачен и наследует фон webview; navigation-bar нет.
 *   setStyle корректен; Android-специфичные вызовы пропускаем.
 *
 * Web — полный no-op.
 */
export async function applyStatusBarTheme(isDark: boolean): Promise<void> {
  if (!env.isNative) return;

  const isAndroid = Capacitor.getPlatform() === 'android';
  const chrome = chromeColor(isDark);

  const { StatusBar, Style } = await import('@capacitor/status-bar');
  // Стиль иконок: корректен и для iOS, и для Android.
  await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light });

  if (!isAndroid) return;

  // --- Android-only ---
  // НЕ зовём setOverlaysWebView({overlay:false}): при отключённом принудительном
  // edge-to-edge (windowOptOutEdgeToEdgeEnforcement=true в styles.xml) система уже
  // держит WebView ниже статус-бара. Дополнительный overlay:false навешивал ВТОРОЙ
  // инсет статус-бара → WebView съезжал на 2×высоты бара, оставляя белую полосу
  // (фон контейнера) между статус-баром и WebView. Красим только фон баров.
  await StatusBar.setBackgroundColor({ color: chrome });

  // Navigation-bar (нижняя системная панель): стиль кнопок + цвет под фон экрана.
  // darkButtons=true → тёмные кнопки (светлая тема); false → светлые (тёмная тема).
  const { NavigationBar } = await import('@capgo/capacitor-navigation-bar');
  await NavigationBar.setNavigationBarColor({ color: chrome, darkButtons: !isDark });
}
