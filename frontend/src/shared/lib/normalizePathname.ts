/**
 * Strips a trailing slash from a pathname, except for the root "/".
 *
 * Some browsers occasionally append a trailing slash to a URL
 * that the app never explicitly navigated to — e.g. "/welcome/" instead of
 * "/welcome". Without normalisation, strict equality checks used in view-gate
 * guards would fail silently and leave the gate open or cause missed redirects.
 *
 * @example
 * normalizePathname('/welcome/')  // → '/welcome'
 * normalizePathname('/welcome')   // → '/welcome'
 * normalizePathname('/')          // → '/'   (root is preserved as-is)
 */
export function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1);
  }
  return pathname;
}
