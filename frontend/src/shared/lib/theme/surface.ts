/**
 * Colors for the chrome that sits OUTSIDE the web page: the iOS/Android status
 * bar, the Android navigation bar, the PWA splash screen, and the browser UI
 * that `<meta name="theme-color">` tints.
 *
 * These literals are a DELIBERATE exception to the "semantic tokens only" rule:
 * none of those consumers can read a CSS custom property, so each needs the
 * resolved hex. Do not replace them with tokens and do not delete them.
 *
 * They MUST stay equal to their counterparts in
 * frontend/src/app/styles/index.css:
 *   LIGHT --surface: #fafaf8   first stop of --gradient-primary: #fdf6ef
 *   DARK  --surface: #161412   first stop of --gradient-primary: #1e1208
 *
 * surface.test.ts parses that CSS and asserts the equality, so a token edit on
 * either side fails the build instead of silently desyncing the chrome.
 */
export const SURFACE_LIGHT = '#fafaf8';
export const SURFACE_DARK = '#161412';

/**
 * The colour directly beneath the status bar.
 *
 * NOT `--surface`. Every screen in the app renders `<Page background="gradient">`
 * — the auth and onboarding screens, all 22 feature pages, and the settings and
 * support screens through `PageShell` — so `.page--gradient` paints
 * `--gradient-bg-primary` from the very top of the viewport. `.page-header` pads
 * itself by `env(safe-area-inset-top)` rather than covering that band, which
 * means what actually shows through under the status bar is the gradient's FIRST
 * stop, not the flat `--surface` fill.
 *
 * Tinting the chrome `--surface` instead would leave a visible seam exactly where
 * the status bar meets the page: #161412 against #1e1208 in dark, #fafaf8 against
 * #fdf6ef in light. Both are small deltas, but they are the ones the user sees,
 * because a seam reads as a hard edge however slight the step.
 */
export const CHROME_LIGHT = '#fdf6ef';
export const CHROME_DARK = '#1e1208';

export function surfaceColor(isDark: boolean): string {
  return isDark ? SURFACE_DARK : SURFACE_LIGHT;
}

/** The status-bar / theme-color tint for the active theme. */
export function chromeColor(isDark: boolean): string {
  return isDark ? CHROME_DARK : CHROME_LIGHT;
}
