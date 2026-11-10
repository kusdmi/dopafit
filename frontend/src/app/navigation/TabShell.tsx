import { Activity, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useNavigationType, type Location } from 'react-router-dom';
import { safeRandomUUID } from '@/shared/lib/uuid';
import { NavigationContext, type NavigationController } from '@/shared/lib/navigation-context';
import { AppTabBar } from '@/app/bottom-nav/BottomNav';
import { TabContext } from './tab-context';
import { address, initialStacks, observeLocation, type ScreenEntry } from './stack';
import { tabForPath, tabRoots, type AppTab } from './tabs';

export function TabShell({ renderScreen }: { renderScreen: (location: Location) => ReactNode }) {
  const location = useLocation();
  const action = useNavigationType();
  const navigate = useNavigate();
  const [state, setState] = useState(() => initialStacks(location));
  if (state.observedKey !== location.key) setState(observeLocation(state, location, action));
  const live = useRef<{ state: typeof state; location: Location } | null>({ state, location });
  useLayoutEffect(() => {
    live.current = { state, location };
    return () => {
      live.current = null;
    };
  }, [state, location]);
  const activeTab = tabForPath(location.pathname);
  const activeEntry = state.tabs[activeTab]?.at(-1)?.id;

  const operations = useMemo(() => {
    const restore = (entry: ScreenEntry) => {
      setState((previous) => ({ ...previous, pending: entry.id }));
      void navigate(address(entry.location), { state: entry.location.state });
    };
    const move = (source: ScreenEntry, to: string, payload: unknown, replace: boolean) => {
      const current = live.current;
      if (!current) return;
      const sourceTab = tabForPath(source.location.pathname);
      const stack = current.state.tabs[sourceTab] ?? [];
      // A parent that has since been left cannot replace a newer screen.
      if (stack.at(-1)?.id !== source.id) return;
      const active =
        sourceTab === tabForPath(current.location.pathname) && stack.at(-1)?.id === source.id;
      if (active) {
        void navigate(to, { state: payload, replace });
        return;
      }
      // An async completion updates its own hidden stack, never the visible URL.
      const url = new URL(to, window.location.origin);
      if (url.origin !== window.location.origin) return;
      const next: Location = {
        pathname: url.pathname,
        search: url.search,
        hash: url.hash,
        state: payload,
        key: safeRandomUUID(),
      };
      setState((previous) => {
        const nextState = observeLocation(
          { ...previous, pending: undefined },
          next,
          replace ? 'REPLACE' : 'PUSH',
        );
        return { ...nextState, observedKey: previous.observedKey };
      });
    };
    return {
      select(tab: AppTab) {
        const current = live.current;
        if (!current) return;
        const stack = current.state.tabs[tab] ?? [];
        const selected = tab === tabForPath(current.location.pathname);
        const target = selected
          ? stack.find((entry) => entry.location.pathname === tab)
          : stack.at(-1);
        if (selected && current.location.pathname === tab) {
          document
            .querySelector<HTMLElement>('[data-tab-screen-active] [data-scroll-container]')
            ?.scrollTo({ top: 0, behavior: 'instant' });
          return;
        }
        if (target) restore(target);
        else void navigate(tab);
      },
      move,
      back(source: ScreenEntry, fallback?: string, delta = -1) {
        const current = live.current;
        if (!current) return;
        const tab = tabForPath(source.location.pathname);
        const stack = current.state.tabs[tab] ?? [];
        const index = stack.findIndex((entry) => entry.id === source.id);
        const destination = stack[index + delta];
        if (destination) {
          const active =
            tab === tabForPath(current.location.pathname) && index === stack.length - 1;
          if (active) restore(destination);
          else
            setState((previous) => ({
              ...previous,
              tabs: { ...previous.tabs, [tab]: stack.slice(0, index + delta + 1) },
            }));
        } else if (index >= 0) move(source, fallback ?? tab, undefined, false);
      },
      forward: (delta: number) => {
        if (live.current) void navigate(delta);
      },
    };
  }, [navigate]);

  return (
    <TabContext.Provider
      value={{
        active: activeTab,
        destinations: Object.fromEntries(
          tabRoots.map((tab) => [
            tab,
            state.tabs[tab]?.at(-1) && address(state.tabs[tab]!.at(-1)!.location),
          ]),
        ),
        select: operations.select,
      }}
    >
      <div className="protected-shell">
        {tabRoots.flatMap((tab) =>
          (state.tabs[tab] ?? []).map((entry) => (
            <Activity
              key={entry.id}
              mode={tab === activeTab && entry.id === activeEntry ? 'visible' : 'hidden'}
            >
              <div
                className="tab-screen"
                data-tab-screen-active={
                  tab === activeTab && entry.id === activeEntry ? '' : undefined
                }
              >
                <ScreenNavigation entry={entry} operations={operations}>
                  {renderScreen(entry.location)}
                </ScreenNavigation>
              </div>
            </Activity>
          )),
        )}
        <AppTabBar />
      </div>
    </TabContext.Provider>
  );
}

interface ScreenOperations {
  move(source: ScreenEntry, to: string, state: unknown, replace: boolean): void;
  back(source: ScreenEntry, fallback?: string, delta?: number): void;
  forward(delta: number): void;
}

function ScreenNavigation({
  entry,
  operations,
  children,
}: {
  entry: ScreenEntry;
  operations: ScreenOperations;
  children: ReactNode;
}) {
  const controller = useMemo<NavigationController>(
    () => ({
      push: (to, state) => operations.move(entry, to, state, false),
      replace: (to, state) => operations.move(entry, to, state, true),
      goBack: (fallback) => operations.back(entry, fallback),
      go: (delta) => {
        if (delta < 0) operations.back(entry, undefined, delta);
        else operations.forward(delta);
      },
    }),
    [entry, operations],
  );
  return <NavigationContext.Provider value={controller}>{children}</NavigationContext.Provider>;
}
