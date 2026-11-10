import { createContext } from 'react';

export interface NavigationController {
  push(to: string, state?: unknown): void;
  replace(to: string, state?: unknown): void;
  goBack(fallback?: string): void;
  go(delta: number): void;
}

/** Supplied by the app shell; standalone features keep React Router's defaults. */
export const NavigationContext = createContext<NavigationController | null>(null);
