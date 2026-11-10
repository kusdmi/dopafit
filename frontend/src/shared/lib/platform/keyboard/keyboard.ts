import { env } from '@/shared/config/env';

export async function initKeyboard(): Promise<void> {
  if (!env.isNative) return;
  const { Keyboard, KeyboardResize } = await import('@capacitor/keyboard');
  const { Capacitor } = await import('@capacitor/core');
  if (Capacitor.getPlatform() === 'android') return;
  await Keyboard.setResizeMode({ mode: KeyboardResize.Native });
  await Keyboard.setAccessoryBarVisible({ isVisible: true });
}

export function keepFocusedFieldVisible(): () => void {
  return trackStandaloneKeyboard();
}

/** Keep the page's layout stable; only its scrollable content clears the keyboard. */
export function trackStandaloneKeyboard(): () => void {
  const viewport = window.visualViewport;
  if (!viewport) return () => {};
  const root = document.documentElement;
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:absolute;top:0;left:0;height:100lvh;width:0;visibility:hidden;pointer-events:none';
  document.body.append(probe);
  let baseline = root.getBoundingClientRect().height || window.innerHeight;
  let width = viewport.width;
  let open = false;
  let frame = 0;
  const clear = () => {
    root.removeAttribute('data-keyboard-open');
    for (const key of [
      '--keyboard-layout-height',
      '--keyboard-overlap',
      '--keyboard-visible-height',
    ])
      root.style.removeProperty(key);
  };
  const reveal = () => {
    if (!open) return;
    const active = document.activeElement;
    if (
      !(active instanceof HTMLElement) ||
      !active.matches('input, textarea, select, [contenteditable="true"]')
    )
      return;
    const scroller = active.closest<HTMLElement>('[data-scroll-container]');
    if (!scroller) {
      active.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      return;
    }
    const rect = active.getBoundingClientRect();
    const top = Math.max(viewport.offsetTop + 16, scroller.getBoundingClientRect().top + 16);
    const bottom = viewport.offsetTop + viewport.height - 16;
    if (rect.bottom > bottom) scroller.scrollBy({ top: rect.bottom - bottom, behavior: 'instant' });
    else if (rect.top < top) scroller.scrollBy({ top: rect.top - top, behavior: 'instant' });
  };
  const sync = () => {
    if (viewport.width !== width) {
      clear();
      open = false;
      width = viewport.width;
      baseline = root.getBoundingClientRect().height || probe.getBoundingClientRect().height;
    }
    const visibleBottom = viewport.height + viewport.offsetTop;
    const editing = document.activeElement?.matches(
      'input, textarea, select, [contenteditable="true"]',
    );
    const overlap = Math.max(0, baseline - visibleBottom);
    open =
      viewport.scale !== undefined && Math.abs(viewport.scale - 1) > 0.05
        ? false
        : overlap > 150 && (open || !!editing);
    if (open) {
      root.setAttribute('data-keyboard-open', '');
      root.style.setProperty('--keyboard-layout-height', `${baseline}px`);
      root.style.setProperty('--keyboard-overlap', `${overlap}px`);
      root.style.setProperty('--keyboard-visible-height', `${viewport.height}px`);
    } else {
      clear();
      baseline = root.getBoundingClientRect().height || window.innerHeight;
    }
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(reveal);
  };
  viewport.addEventListener('resize', sync);
  viewport.addEventListener('scroll', sync);
  document.addEventListener('focusin', sync);
  document.addEventListener('focusout', sync);
  window.addEventListener('pageshow', sync);
  window.addEventListener('orientationchange', sync);
  sync();
  return () => {
    cancelAnimationFrame(frame);
    viewport.removeEventListener('resize', sync);
    viewport.removeEventListener('scroll', sync);
    document.removeEventListener('focusin', sync);
    document.removeEventListener('focusout', sync);
    window.removeEventListener('pageshow', sync);
    window.removeEventListener('orientationchange', sync);
    probe.remove();
    clear();
  };
}
