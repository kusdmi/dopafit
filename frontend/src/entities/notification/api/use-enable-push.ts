import { useCallback, useState } from 'react';

import { api } from '@/shared/api/client';
import { registerPush } from '@/shared/lib/platform/push/register-push';
import { pushPermission, type PushPermission } from '@/shared/lib/platform/push/permission';

export interface EnablePushState {
  permission: PushPermission;
  pending: boolean;
  /** Запрос сделан, но токен не получен — разрешение отклонено или подписка не вышла. */
  failed: boolean;
}

/**
 * Запрашивает разрешение и регистрирует подписку ПО ЖЕСТУ пользователя.
 *
 * Нужен отдельно от `usePushRegistration` (которая работает в фоне при загрузке):
 * Safari на iOS принимает `Notification.requestPermission()` только внутри обработчика
 * пользовательского жеста — вызов при монтировании там просто отклоняется, и
 * пользователь никогда не видит системного диалога. Поэтому запрос живёт на кнопке
 * «Включить уведомления» в настройках, а фоновая регистрация остаётся для случая,
 * когда разрешение уже выдано и нужно лишь обновить подписку.
 */
export function useEnablePush() {
  const [state, setState] = useState<EnablePushState>(() => ({
    permission: pushPermission(),
    pending: false,
    failed: false,
  }));

  const enable = useCallback(async () => {
    setState((s) => ({ ...s, pending: true, failed: false }));
    try {
      const request = await registerPush(true);
      if (!request) {
        setState({ permission: pushPermission(), pending: false, failed: true });
        return false;
      }
      const { error } = await api.POST('/api/v1/notifications/push-token', { body: request });
      setState({ permission: pushPermission(), pending: false, failed: Boolean(error) });
      return !error;
    } catch {
      setState({ permission: pushPermission(), pending: false, failed: true });
      return false;
    }
  }, []);

  return { ...state, enable };
}
