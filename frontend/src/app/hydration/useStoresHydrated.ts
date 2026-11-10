import { useEffect, useState } from 'react';

import { useOnboardingStore } from '@/entities/onboarding/model/store';
import { useSessionStore } from '@/entities/session/model/store';
import { useWorkoutStore } from '@/entities/workout/model/store';

function allHydrated(): boolean {
  return (
    useSessionStore.persist.hasHydrated() &&
    useWorkoutStore.persist.hasHydrated() &&
    useOnboardingStore.persist.hasHydrated()
  );
}

/**
 * true, когда все persist-сторы (session, workout, onboarding) завершили
 * асинхронную гидрацию. До этого App.tsx держит splash, чтобы
 * isAuthenticated/активная тренировка не мелькали как пустые.
 *
 * Онбординг здесь обязателен: его флаг «уже видели» лежит в том же асинхронном
 * сторадже, и без ожидания гидрации первый кадр приходил бы с `seen: false` —
 * то есть экран первого запуска моргал бы на КАЖДОМ старте приложения.
 */
export function useStoresHydrated(): boolean {
  const [hydrated, setHydrated] = useState(() => allHydrated());

  useEffect(() => {
    if (hydrated) return;
    const check = () => {
      if (allHydrated()) setHydrated(true);
    };
    const unsubSession = useSessionStore.persist.onFinishHydration(check);
    const unsubWorkout = useWorkoutStore.persist.onFinishHydration(check);
    const unsubOnboarding = useOnboardingStore.persist.onFinishHydration(check);
    check();
    return () => {
      unsubSession();
      unsubWorkout();
      unsubOnboarding();
    };
  }, [hydrated]);

  return hydrated;
}
