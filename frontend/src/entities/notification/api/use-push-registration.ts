import { useEffect, useRef } from 'react';

import { useSessionStore } from '@/entities/session/@x/notification';
import { api } from '@/shared/api/client';
import { registerPush } from '@/shared/lib/platform/push/register-push';

import { useNotificationSettings } from './use-notification-settings';

/** Refreshes an existing permission once per session without prompting in the background. */
export function usePushRegistration(): void {
  const isAuthenticated = useSessionStore((s) => s.isAuthenticated);
  const { data: settings } = useNotificationSettings();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    if (!isAuthenticated) return;
    if (!settings?.push_enabled) return;
    done.current = true;
    void (async () => {
      try {
        const req = await registerPush();
        if (!req) {
          done.current = false; // нет токена — дать повторить при следующем триггере
          return;
        }
        const { error } = await api.POST('/api/v1/notifications/push-token', { body: req });
        if (error) done.current = false; // сбой отправки — разрешить retry
      } catch {
        // registerPush обычно резолвит null, но на всякий случай не блокируем retry.
        done.current = false;
      }
    })();
  }, [isAuthenticated, settings?.push_enabled]);
}
