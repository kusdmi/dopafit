import { platformStorage } from '@/shared/lib/platform/storage/settings';

import { chromeColor } from './surface';

export type ThemePreference = 'light' | 'dark' | 'system';

export const THEME_VALUES: readonly ThemePreference[] = ['light', 'dark', 'system'];

const STORAGE_KEY = 'dopafit.theme';

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (THEME_VALUES as readonly string[]).includes(value);
}

/**
 * Point every `<meta name="theme-color">` at the chrome colour for the
 * EFFECTIVE theme, and collapse them to a single unconditional tag.
 *
 * One unconditional tag follows the in-app preference even when it differs
 * from the OS. This is a hint for browsers and installed apps that support it;
 * Safari may derive its toolbar tint from the document canvas instead. The
 * CSS --chrome-bg token matches this colour (checked in surface.test.ts).
 */
export function applyThemeColor(isDark: boolean): void {
  const color = chromeColor(isDark);
  const existing = [...document.head.querySelectorAll('meta[name="theme-color"]')];
  const meta = existing[0] ?? document.head.appendChild(document.createElement('meta'));
  // Drop the OS-keyed duplicates: with several tags the browser honours the
  // first whose media matches, so leaving them would let the OS override us.
  existing.slice(1).forEach((tag) => tag.remove());
  meta.setAttribute('name', 'theme-color');
  meta.removeAttribute('media');
  meta.setAttribute('content', color);
}

/**
 * Apply the theme to <html>. `system` removes the attribute so the CSS
 * `prefers-color-scheme` fallback drives the palette.
 *
 * Also retints the browser/PWA chrome, so the status bar follows the same
 * choice the palette does.
 */
export function applyTheme(theme: ThemePreference): void {
  const root = document.documentElement;
  if (theme === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', theme);
  }
  applyThemeColor(isEffectiveDark(theme));
}

/** Locally cached preference so the theme is correct on first paint, before settings load. */
export function getStoredTheme(): ThemePreference {
  const stored = platformStorage.get(STORAGE_KEY);
  return isThemePreference(stored) ? stored : 'system';
}

export function storeTheme(theme: ThemePreference): void {
  platformStorage.set(STORAGE_KEY, theme);
}

/** Whether the OS currently prefers a dark color scheme. */
export function prefersDarkScheme(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

/**
 * Resolves a preference to an effective dark/light boolean, consulting the OS
 * scheme for `system`. Kept here (the single place matchMedia is read) so the
 * status-bar sync and any future consumer share one definition.
 */
export function isEffectiveDark(pref: ThemePreference): boolean {
  if (pref === 'dark') return true;
  if (pref === 'light') return false;
  return prefersDarkScheme();
}

/**
 * Subscribes to OS color-scheme changes and invokes `listener` on each flip.
 * Returns an unsubscribe. No-op (returns a noop cleanup) where matchMedia is
 * unavailable.
 */
export function subscribeToSchemeChange(listener: () => void): () => void {
  const mql = window.matchMedia?.('(prefers-color-scheme: dark)');
  if (!mql) return () => {};
  mql.addEventListener('change', listener);
  return () => mql.removeEventListener('change', listener);
}
