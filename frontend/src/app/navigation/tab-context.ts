import { createContext } from 'react';
import type { AppTab } from './tabs';

export const TabContext = createContext<{
  active: AppTab;
  destinations: Partial<Record<AppTab, string>>;
  select(tab: AppTab): void;
} | null>(null);
