import { useState, type ReactNode } from 'react';
import { BuilderStoreContext, createBuilderStore } from './model/store';

export function BuilderStoreProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createBuilderStore);
  return <BuilderStoreContext.Provider value={store}>{children}</BuilderStoreContext.Provider>;
}
