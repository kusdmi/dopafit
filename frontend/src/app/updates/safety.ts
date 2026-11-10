import type { QueryClient } from '@tanstack/react-query';
import { useWorkoutStore } from '@/entities/workout/model/store';
import { listFailedMutations } from '@/shared/lib/offline/failed-mutations';
import { listPendingPhotos } from '@/shared/lib/offline/photo-queue';
import { getStorageError } from '@/shared/lib/platform/storage/errors';

function synchronousBlocker(client: QueryClient): string | null {
  if (Object.keys(useWorkoutStore.getState().sessions).length)
    return 'Обновление будет доступно после завершения активных тренировок.';
  if (getStorageError()) return 'Сначала сохраните данные на устройстве.';
  if (
    client
      .getMutationCache()
      .getAll()
      .some((mutation) => mutation.state.status === 'pending' || mutation.state.isPaused)
  )
    return 'Дождитесь сохранения и синхронизации изменений.';
  return null;
}

export async function updateBlockedReason(client: QueryClient): Promise<string | null> {
  const blocked = synchronousBlocker(client);
  if (blocked) return blocked;
  if ((await listFailedMutations()).length || (await listPendingPhotos()).length)
    return 'Сначала синхронизируйте несохранённые изменения и фотографии.';
  return synchronousBlocker(client);
}
