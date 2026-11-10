import { paths } from '@/shared/config/paths';

export const tabRoots = [
  paths.home,
  paths.measurements,
  paths.programs,
  paths.analytics,
  paths.settings,
] as const;
export type AppTab = (typeof tabRoots)[number];

export function tabForPath(pathname: string): AppTab {
  if (
    pathname === paths.support ||
    pathname.startsWith(`${paths.support}/`) ||
    pathname === paths.subscriptionCheckout
  )
    return paths.settings;
  return (
    tabRoots.find((root) => pathname === root || pathname.startsWith(`${root}/`)) ?? paths.home
  );
}
