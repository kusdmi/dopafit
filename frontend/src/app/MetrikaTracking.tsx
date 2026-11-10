import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

import { useSessionStore } from '@/entities/session/model/store';
import { trackMetrikaContext, trackMetrikaPage } from '@/shared/lib/telemetry/metrika';

export function MetrikaTracking() {
  const { pathname } = useLocation();
  const role = useSessionStore((state) => state.user?.role ?? 'guest');
  useEffect(() => trackMetrikaPage(pathname), [pathname]);
  useEffect(() => trackMetrikaContext(role), [role]);
  return null;
}
