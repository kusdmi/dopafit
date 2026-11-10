import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import {
  listFailedMutations,
  removeFailedMutation,
  subscribeFailedMutations,
  type FailedMutation,
} from './failed-mutations';

/** Reactive view of the failed outbox for UI (indicator / retry panel). */
export function useFailedMutations(): FailedMutation[] {
  const [items, setItems] = useState<FailedMutation[]>([]);

  useEffect(() => {
    let alive = true;
    void listFailedMutations().then((current) => {
      if (alive) setItems(current);
    });
    const unsub = subscribeFailedMutations((next) => setItems(next));
    return () => {
      alive = false;
      unsub();
    };
  }, []);

  return items;
}

/**
 * Retries a persisted failed mutation by re-running the SAME mutationFn (from the
 * defaults registered in setupOffline) with the persisted variables, then firing
 * the same-key onSuccess/onSettled invalidations so the retry refreshes the UI
 * exactly like a normal replay. On success the outbox entry is removed; on failure
 * it stays for another attempt.
 */
export function useRetryFailedMutation() {
  const queryClient = useQueryClient();

  return async (item: FailedMutation): Promise<boolean> => {
    const defaults = queryClient.getMutationDefaults([...item.key]);
    const mutationFn = defaults?.mutationFn as
      | ((variables: unknown) => Promise<unknown>)
      | undefined;
    if (!mutationFn) return false;

    // The registered onSuccess/onSettled only read (data, variables); the trailing
    // onMutate-result / context args are unused, so a loose call signature keeps
    // this generic across all failed-mutation keys without per-key typing.
    const onSuccess = defaults?.onSuccess as
      | ((...args: unknown[]) => unknown)
      | undefined;
    const onSettled = defaults?.onSettled as
      | ((...args: unknown[]) => unknown)
      | undefined;

    try {
      const data = await mutationFn(item.variables);
      // Reuse the registered success/settled side effects (cache invalidation).
      await onSuccess?.(data, item.variables, undefined, undefined);
      await onSettled?.(data, null, item.variables, undefined, undefined);
      await removeFailedMutation(item.id);
      return true;
    } catch {
      // Keep it queued for another attempt.
      return false;
    }
  };
}
