import { useMutation } from '@tanstack/react-query';

import { api, toApiError } from '@/shared/api/client';
import { SET_FAVORITE_KEY } from '@/shared/lib/offline/mutationKeys';

export interface FavoriteVars {
  id: string;
  isFavorite: boolean;
}

export async function setFavoriteMutationFn({ id, isFavorite }: FavoriteVars) {
  // Contract: is_favorite is a query param, not a request body (requestBody?: never).
  const { data, error } = await api.PUT('/api/v1/exercises/{exercise_id}/favorite', {
    params: {
      path: { exercise_id: id },
      query: { is_favorite: isFavorite },
    },
  });
  if (error) throw toApiError(error);
  return data;
}

// The optimistic onMutate/onError and the onSettled invalidations live in the
// mutation defaults (setupOffline.ts) so they fire on BOTH a plain online toggle
// and the replay of a paused offline toggle after a restart.
export function useSetFavorite() {
  return useMutation({
    mutationKey: [...SET_FAVORITE_KEY],
    mutationFn: setFavoriteMutationFn,
  });
}
