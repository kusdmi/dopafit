import { bindQueryCache, QUERY_GC_TIME } from '@/shared/lib/query/cache-policy';
import { QueryClient, useIsRestoring } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { AppFrame } from '@/shared/ui/primitives';
import { FeedbackHost } from '@/shared/ui/feedback';
import { StorageErrorNotice } from '@/shared/ui/StorageErrorNotice';
import { CaptchaHost } from '@/shared/ui/CaptchaHost';
import { useEffect, useState } from 'react';

import { setFavoriteMutationFn } from '@/entities/exercise/api/use-set-favorite';
import { saveMeasurementMutationFn } from '@/entities/measurement/api/use-save-measurement';
import { updateMeasurementMutationFn } from '@/entities/measurement/api/use-update-measurement';
import { markReadMutationFn } from '@/entities/notification/api/use-mark-read';
import { saveNotificationSettingsMutationFn } from '@/entities/notification/api/use-notification-settings';
import { addExerciseToProgramMutationFn } from '@/entities/program/api/use-add-exercise';
import { saveProgramMutationFn } from '@/entities/program/api/use-save-program';
import { addReplyMutationFn, createTicketMutationFn } from '@/entities/support/api/use-support';
import { syncSessionMutationFn } from '@/entities/workout/api/use-sync-session';
import { registerQueryClient, registerSessionSync } from '@/entities/session/model/teardown';
import { useSessionStore } from '@/entities/session/model/store';
import { restoreOwnerOutbox } from '@/shared/lib/offline/session-outbox';
import { reportStorageError } from '@/shared/lib/platform/storage/errors';
import { setFailedMutationAuthGate } from '@/shared/lib/offline/failed-mutations';
import {
  bindOnlineManager,
  registerMeasurementMutationDefaults,
  registerNotificationSupportMutationDefaults,
  registerStage3MutationDefaults,
  registerWorkoutMutationDefaults,
} from '@/shared/lib/offline/setupOffline';
import {
  PERSIST_MAX_AGE,
  queryPersister,
  shouldDehydrateMutation,
  shouldPersistQuery,
} from '@/shared/lib/query/persistQueryClient';
import { useStoresHydrated } from '@/app/hydration/useStoresHydrated';
import { requestPersistentStorage } from '@/shared/lib/platform/storage/request-persistent';
import { ensureFreshInstall } from '@/shared/lib/platform/storage/install-marker';
import { hideSplash } from '@/shared/lib/platform/splash-screen/splash';
import { initKeyboard } from '@/shared/lib/platform/keyboard/keyboard';
import { trackSafeAreaBottom } from '@/shared/lib/platform/safe-area/safe-area';
import { env } from '@/shared/config/env';
import { bindMetrikaMutations } from '@/shared/lib/telemetry/mutation-goals';

import { OfflineIndicator } from '@/features/sync-status/OfflineIndicator';
import { FailedSyncIndicator } from '@/features/sync-status/FailedSyncIndicator';

import { AppRoutes } from './router';
import { PushRegistration } from './PushRegistration';
import { ThemeSync } from './ThemeSync';
import { AppUpdates } from './updates/AppUpdates';

export function App() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, staleTime: 30_000, gcTime: Infinity },
          mutations: { gcTime: QUERY_GC_TIME },
        },
      }),
  );
  const [offlineDefaultsReady, setOfflineDefaultsReady] = useState(false);

  const hydrated = useStoresHydrated();
  const userId = useSessionStore((state) => state.user?.id);

  useEffect(() => {
    // Register the app QueryClient so the 'unauthorized' teardown path (which
    // runs outside React) can clear the in-memory cache on forced logout.
    registerQueryClient(queryClient);
    const unbindCache = bindQueryCache(queryClient);
    const unbindMetrika = bindMetrikaMutations(
      queryClient,
      () => useSessionStore.getState().isAuthenticated,
    );
    const unbindSessionSync = registerSessionSync(queryClient);
    void requestPersistentStorage();
    void ensureFreshInstall();
    void initKeyboard();
    // Gate the failed-outbox on LIVE auth state so a mutation that finishes
    // retrying after logout/teardown does not write the outgoing user's payload
    // into the cleared store (MAJOR-3).
    setFailedMutationAuthGate(() => useSessionStore.getState().isAuthenticated);
    // Держит --safe-area-bottom максимумом виденных инсетов: на iOS env()
    // приезжает уже после первой раскладки, и без этого нижний контент при
    // запуске прячется под таб-баром до первого скролла.
    const untrackSafeArea = trackSafeAreaBottom();
    const unbindOnlineManager = bindOnlineManager();
    registerMeasurementMutationDefaults(queryClient, {
      save: saveMeasurementMutationFn as (v: unknown) => Promise<unknown>,
      update: updateMeasurementMutationFn as (v: unknown) => Promise<unknown>,
    });
    registerStage3MutationDefaults(queryClient, {
      saveProgram: saveProgramMutationFn as (v: unknown) => Promise<unknown>,
      addExercise: addExerciseToProgramMutationFn as (v: unknown) => Promise<unknown>,
      setFavorite: setFavoriteMutationFn as (v: unknown) => Promise<unknown>,
    });
    registerWorkoutMutationDefaults(queryClient, syncSessionMutationFn);
    registerNotificationSupportMutationDefaults(queryClient, {
      markRead: markReadMutationFn as (v: unknown) => Promise<unknown>,
      saveNotificationSettings: saveNotificationSettingsMutationFn as (
        v: unknown,
      ) => Promise<unknown>,
      createTicket: createTicketMutationFn as (v: unknown) => Promise<unknown>,
      addReply: addReplyMutationFn as (v: unknown) => Promise<unknown>,
    });
    let active = true;
    queueMicrotask(() => {
      if (active) setOfflineDefaultsReady(true);
    });
    return () => {
      active = false;
      unbindCache();
      unbindMetrika();
      unbindSessionSync();
      untrackSafeArea();
      unbindOnlineManager();
    };
  }, [queryClient]);

  useEffect(() => {
    if (hydrated && env.isNative) {
      void hideSplash();
    }
  }, [hydrated]);

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: queryPersister,
        maxAge: PERSIST_MAX_AGE,
        dehydrateOptions: {
          shouldDehydrateQuery: (query) =>
            query.state.status === 'success' && shouldPersistQuery(query.queryKey),
          shouldDehydrateMutation,
        },
      }}
      onSuccess={() => {
        void queryClient.resumePausedMutations();
      }}
    >
      <OwnerOutboxRestore
        queryClient={queryClient}
        userId={hydrated && offlineDefaultsReady ? userId : undefined}
      />
      <ThemeSync />
      <AppUpdates ready={hydrated && offlineDefaultsReady} />
      <PushRegistration />
      <AppFrame>
        <FeedbackHost />
        <CaptchaHost />
        <StorageErrorNotice />
        {hydrated && (
          <>
            <AppRoutes />
            <OfflineIndicator />
            <FailedSyncIndicator />
          </>
        )}
      </AppFrame>
    </PersistQueryClientProvider>
  );
}

function OwnerOutboxRestore({
  queryClient,
  userId,
}: {
  queryClient: QueryClient;
  userId: string | undefined;
}) {
  const restoring = useIsRestoring();

  useEffect(() => {
    if (restoring || !userId) return;
    let active = true;
    void restoreOwnerOutbox(
      queryClient,
      userId,
      () => active && useSessionStore.getState().user?.id === userId,
    ).catch(() => reportStorageError());
    return () => {
      active = false;
    };
  }, [queryClient, restoring, userId]);

  return null;
}
