import { useContext, useLayoutEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { NavigationContext } from './navigation-context';

/** Small platform-independent imperative companion to declarative routes. */
export function useNavigation() {
  const navigate = useNavigate();
  const controller = useContext(NavigationContext);
  const location = useLocation();
  const currentLocation = useRef(location);
  useLayoutEffect(() => {
    currentLocation.current = location;
  }, [location]);
  return useMemo(
    () => ({
      get location() {
        return currentLocation.current;
      },
      push: (to: string, state?: unknown) => {
        if (controller) controller.push(to, state);
        else void navigate(to, { state });
      },
      replace: (to: string, state?: unknown) => {
        if (controller) controller.replace(to, state);
        else void navigate(to, { state, replace: true });
      },
      goBack: (fallback?: string) => {
        if (controller) controller.goBack(fallback);
        else void navigate(-1);
      },
      go: (delta: number) => {
        if (controller) controller.go(delta);
        else void navigate(delta);
      },
    }),
    [navigate, controller],
  );
}
