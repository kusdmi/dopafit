/**
 * Стабилизация нижнего safe-area-инсета в WKWebView.
 *
 * На iOS `env(safe-area-inset-bottom)` на первых кадрах после холодного старта
 * отдаёт ЗАВЫШЕННОЕ значение (наблюдалось ~46px там, где home-indicator равен
 * 34px) и уточняется уже после того, как вебвью встанет в окончательные
 * границы. Всё, что на него опирается, в этот момент считается с запасом — в
 * первую очередь `--tab-bar-space`, то есть место, которое страница резервирует
 * под плавающий таб-бар. На устройстве это выглядит так: при запуске бар висит
 * слишком высоко, под ним пустая полоса, а первый же скролл заставляет WebKit
 * пересчитать инсет, и бар опускается на место.
 *
 * Поэтому переменная СЛЕДУЕТ за актуальным значением, а не запоминает
 * максимум: запомненный максимум как раз и «замораживает» завышенный стартовый
 * инсет навсегда.
 *
 * Исключение — ноль. При показе клавиатуры (`resize: native`) вебвью
 * укорачивается и инсет честно становится нулевым; если следовать и за ним,
 * резерв схлопнется на каждый фокус в поле и контент прыгнет под баром.
 * Ноль игнорируем, любое положительное значение принимаем как есть.
 */

const VAR_NAME = '--safe-area-bottom';

/** Прочитать текущий env(safe-area-inset-bottom) в пикселях. */
function readInset(): number {
  const probe = document.createElement('div');
  // `fixed` + нулевая ширина: элемент ничего не занимает и не влияет на
  // раскладку, но env() внутри него вычисляется как обычно.
  probe.style.cssText =
    'position:fixed;left:0;top:0;width:0;height:env(safe-area-inset-bottom);pointer-events:none;visibility:hidden';
  document.body.appendChild(probe);
  const value = probe.getBoundingClientRect().height;
  probe.remove();
  return Number.isFinite(value) ? value : 0;
}

/**
 * Следить за нижним инсетом и держать `--safe-area-bottom` в актуальном
 * значении. Возвращает функцию отписки.
 */
export function trackSafeAreaBottom(): () => void {
  let published: number | null = null;

  const sync = () => {
    const next = readInset();
    // Ноль — это клавиатура (см. заголовок файла), а не «инсета нет».
    if (next <= 0 || next === published) return;
    published = next;
    document.documentElement.style.setProperty(VAR_NAME, `${next}px`);
  };

  sync();
  // Стартовое значение уточняется через несколько кадров, поэтому первые
  // полсекунды перепроверяем чаще: на глаз бар должен встать на место сразу,
  // а не после того, как пользователь тронет экран.
  const timers = [60, 150, 300, 600, 1000].map((ms) => setTimeout(sync, ms));
  const raf = requestAnimationFrame(() => {
    sync();
    requestAnimationFrame(sync);
  });
  window.addEventListener('resize', sync);
  window.addEventListener('orientationchange', sync);
  window.visualViewport?.addEventListener('resize', sync);

  return () => {
    cancelAnimationFrame(raf);
    for (const id of timers) clearTimeout(id);
    window.removeEventListener('resize', sync);
    window.removeEventListener('orientationchange', sync);
    window.visualViewport?.removeEventListener('resize', sync);
  };
}
