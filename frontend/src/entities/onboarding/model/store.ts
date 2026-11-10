import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { kvPrefs } from '@/shared/lib/platform/storage/kv-prefs';

interface OnboardingState {
  /** Онбординг уже показывали — второй раз он не открывается. */
  seen: boolean;
  markSeen: () => void;
  /** Только для тестов и отладки: вернуть экран первого запуска. */
  reset: () => void;
}

/**
 * Факт «онбординг уже видели», переживающий перезапуск приложения.
 *
 * `kvPrefs`, а не localStorage: на native это Capacitor Preferences
 * (UserDefaults/SharedPreferences), которые ОС не вычищает под нехваткой места
 * — иначе экран первого запуска возвращался бы к пользователю сам по себе.
 * Тот же сторадж у session/workout, так что онбординг живёт рядом с ними.
 *
 * Флаг НЕ привязан к аккаунту: онбординг показывается до входа и регистрации,
 * когда никакого пользователя ещё нет. По той же причине `clearSession()` его
 * не трогает — выйдя из аккаунта, человек не должен снова смотреть онбординг.
 */
export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      seen: false,
      markSeen: () => set({ seen: true }),
      reset: () => set({ seen: false }),
    }),
    {
      name: 'dopafit.onboarding',
      storage: createJSONStorage(() => kvPrefs),
    },
  ),
);
