import type { QueryClient } from '@tanstack/react-query';

import {
  SAVE_MEASUREMENT_KEY,
  SAVE_PROGRAM_KEY,
  SYNC_WORKOUT_KEY,
} from '@/shared/lib/offline/mutationKeys';
import { trackMetrikaGoal } from './metrika';

/** Success actions also fire for resumed mutations, unlike per-screen callbacks. */
export function bindMetrikaMutations(
  queryClient: QueryClient,
  authenticated: () => boolean,
): () => void {
  return queryClient.getMutationCache().subscribe((event) => {
    if (event.type !== 'updated' || event.action.type !== 'success' || !authenticated()) return;
    const key = event.mutation.options.mutationKey;
    const variables: unknown = event.mutation.state.variables;
    if (!key || !variables || typeof variables !== 'object' || Array.isArray(variables)) return;
    const body = variables as Record<string, unknown>;
    if (key[0] === SAVE_PROGRAM_KEY[0] && key[1] === SAVE_PROGRAM_KEY[1] && !body.programId) {
      trackMetrikaGoal('program_created');
    } else if (key[0] === SAVE_MEASUREMENT_KEY[0] && key[1] === SAVE_MEASUREMENT_KEY[1]) {
      trackMetrikaGoal('measurement_saved');
    } else if (key[0] === SYNC_WORKOUT_KEY[0] && key[1] === SYNC_WORKOUT_KEY[1]) {
      trackMetrikaGoal('workout_completed', { participant: body.client_id ? 'client' : 'self' });
    }
  });
}
