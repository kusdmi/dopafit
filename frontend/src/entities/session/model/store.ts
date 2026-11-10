import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { useWorkoutStore } from '@/entities/workout/@x/session';
import { authEvents } from '@/shared/api/events';
import type { components } from '@/shared/api/schema';
import { tokenStorage } from '@/shared/api/tokens';
import { kvPrefs } from '@/shared/lib/platform/storage/kv-prefs';
import { clearPhotoQueue } from '@/shared/lib/offline/photo-queue';
import { clearFailedMutations } from '@/shared/lib/offline/failed-mutations';
import { clearPersistedQueryCache } from '@/shared/lib/query/persistQueryClient';

export type SessionUser = components['schemas']['UserOut'];
type AuthResponse = components['schemas']['AuthResponse'];

interface SessionState {
  user: SessionUser | null;
  /** Derived: истинно ровно когда есть user. Не персистится отдельно. */
  isAuthenticated: boolean;
  setSession: (auth: AuthResponse) => Promise<void>;
  clearSession: () => Promise<void>;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      setSession: async (auth) => {
        await tokenStorage.set(auth.tokens.access_token, auth.tokens.refresh_token);
        await set({ user: auth.user, isAuthenticated: true });
      },
      clearSession: async () => {
        // clearPersistedQueryCache() удаляет известные idb-ключи (на web в т.ч.
        // токены), поэтому ждём его ПЕРЕД очисткой токенов и состояния.
        await clearPersistedQueryCache();
        // The owner's pending work was archived before teardown. Remove the
        // shared copies so another account cannot see or replay them.
        await clearPhotoQueue();
        await clearFailedMutations();
        await tokenStorage.clear();
        await set({ user: null, isAuthenticated: false });
        // Сбрасываем workout-store явно: на native он живёт в Capacitor
        // Preferences, а не в idb, поэтому очистка idb-кэша его не затрагивает.
        // reset() перезаписывает персист пустым состоянием на всех платформах.
        await useWorkoutStore.getState().reset();
      },
    }),
    {
      name: 'dopafit.session',
      storage: createJSONStorage(() => kvPrefs),
      // Персистим только user; isAuthenticated восстанавливаем из него при гидрации.
      partialize: (state) => ({ user: state.user }),
      onRehydrateStorage: () => (state) => {
        if (state) state.isAuthenticated = state.user != null;
      },
    },
  ),
);

authEvents.on('unauthorized', () => {
  // Lazy import breaks the store ↔ teardown module cycle (teardown imports this
  // store). teardownOnUnauthorized() runs the FULL local teardown — in-memory
  // queryClient.clear() then disk wipe — not just clearSession(), so the still
  // -subscribed persister can't re-dehydrate the previous user's data to disk.
  void import('./teardown').then((m) => m.teardownOnUnauthorized());
});
