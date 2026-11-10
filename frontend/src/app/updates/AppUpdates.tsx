import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useIsRestoring, useQueryClient } from '@tanstack/react-query';
import { env } from '@/shared/config/env';
import type { UpdateState } from '@/shared/lib/platform/app-update/manager';
import { watchAppUpdates } from '@/shared/lib/platform/app-update/watch';
import { persistOfflineState } from '@/shared/lib/query/persistQueryClient';
import { Button } from '@/shared/ui/Button';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { updateBlockedReason } from './safety';

export function AppUpdates({ ready }: { ready: boolean }) {
  const client = useQueryClient();
  const restoring = useIsRestoring();
  const [state, setState] = useState<UpdateState>({ release: null, applying: false, error: null });
  const [confirm, setConfirm] = useState(false);
  const manager = useRef<ReturnType<typeof watchAppUpdates> | null>(null);

  useEffect(() => {
    if (!import.meta.env.PROD || env.isNative || !ready || restoring) return;
    const current = watchAppUpdates({
      currentBuild: __APP_BUILD_ID__,
      blocked: () => updateBlockedReason(client),
      persist: () => persistOfflineState(client),
      changed: setState,
    });
    manager.current = current;
    return () => {
      current.dispose();
      manager.current = null;
    };
  }, [client, ready, restoring]);

  if (!state.release) return null;
  return createPortal(
    <>
      <aside aria-label="Обновление приложения" className="app-update-notice">
        <div role="status" className="min-w-0 flex-1">
          <p className="text-h3 text-content">Доступна новая версия</p>
          <p className="mt-1 text-body-s text-muted">
            {state.error ?? 'Обновите приложение, чтобы получить последние изменения.'}
          </p>
        </div>
        <Button width="content" loading={state.applying} onClick={() => setConfirm(true)}>
          Обновить
        </Button>
      </aside>
      <ConfirmDialog
        isOpen={confirm}
        title="Обновить приложение?"
        message="Сохраните изменения в открытых формах. Приложение перезагрузится, сохранённые данные останутся на устройстве."
        confirmLabel="Обновить"
        cancelLabel="Позже"
        pending={state.applying}
        cancelDisabled={state.applying}
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          void manager.current?.apply().then(() => setConfirm(false));
        }}
      />
    </>,
    document.body,
  );
}
