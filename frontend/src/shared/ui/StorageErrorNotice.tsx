import { useSyncExternalStore } from 'react';
import { getStorageError, subscribeStorageError } from '@/shared/lib/platform/storage/errors';

export function StorageErrorNotice() {
  const message = useSyncExternalStore(subscribeStorageError, getStorageError);
  return message ? (
    <div role="alert" className="storage-error-notice">
      {message}
    </div>
  ) : null;
}
