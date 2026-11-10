import { useSyncExternalStore } from 'react';

import { applyTheme, getStoredTheme, storeTheme, type ThemePreference } from './theme';

let current: ThemePreference = getStoredTheme();
const listeners = new Set<() => void>();

// Apply the cached preference immediately so there is no theme flash on load.
applyTheme(current);

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): ThemePreference {
  return current;
}

/** Set the active theme, persist it locally and notify subscribers. */
export function setThemePreference(theme: ThemePreference): void {
  current = theme;
  storeTheme(theme);
  applyTheme(theme);
  listeners.forEach((listener) => listener());
}

/** Reads the active theme preference and re-renders when it changes. */
export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
