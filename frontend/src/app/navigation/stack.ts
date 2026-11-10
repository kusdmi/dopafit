import type { Location } from 'react-router-dom';
import { tabForPath, type AppTab } from './tabs';

export interface ScreenEntry {
  id: string;
  location: Location;
}
export interface TabStackState {
  tabs: Partial<Record<AppTab, ScreenEntry[]>>;
  bindings: Record<string, string>;
  observedKey: string;
  pending?: string;
}

export const address = (location: Pick<Location, 'pathname' | 'search' | 'hash'>) =>
  location.pathname + location.search + location.hash;

export function observeLocation(
  state: TabStackState,
  location: Location,
  action: 'POP' | 'PUSH' | 'REPLACE',
): TabStackState {
  const tab = tabForPath(location.pathname);
  const stack = state.tabs[tab] ?? [];
  const binding = state.pending ?? state.bindings[location.key];
  const root = location.pathname === tab;
  const existing = stack.findIndex((entry) =>
    binding ? entry.id === binding : root && address(entry.location) === address(location),
  );
  const entry = existing >= 0 ? stack[existing] : { id: location.key, location };
  const nextStack = root
    ? [entry]
    : existing >= 0
      ? stack.slice(0, existing + 1)
      : [...(action === 'REPLACE' && stack.length ? stack.slice(0, -1) : stack), entry];
  return {
    tabs: { ...state.tabs, [tab]: nextStack },
    bindings: { ...state.bindings, [location.key]: entry.id },
    observedKey: location.key,
  };
}

export function initialStacks(location: Location): TabStackState {
  return {
    tabs: { [tabForPath(location.pathname)]: [{ id: location.key, location }] },
    bindings: { [location.key]: location.key },
    observedKey: location.key,
  };
}
