import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api, toApiError } from '@/shared/api/client';
import { tokenStorage } from '@/shared/api/tokens';
import type { components } from '@/shared/api/schema';
import { env } from '@/shared/config/env';

import { exerciseDetailKeyPrefix } from './use-exercise';

type MediaOut = components['schemas']['ExerciseMediaOut'];
type LinkBody = components['schemas']['ExerciseMediaLinkRequest'];

// Multipart upload bypasses openapi-fetch (it cannot stream a File body cleanly);
// use fetch directly with the bearer token, mirroring the api client's auth.
async function uploadExerciseMediaFile(args: {
  exerciseId: string;
  kind: 'image' | 'gif';
  file: File;
}): Promise<MediaOut> {
  const form = new FormData();
  form.append('kind', args.kind);
  form.append('file', args.file);
  const token = await tokenStorage.getAccess();
  const res = await globalThis.fetch(
    `${env.apiUrl}/api/v1/exercises/${args.exerciseId}/media`,
    {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form,
    },
  );
  if (!res.ok) throw new Error(`media upload failed: ${res.status}`);
  return (await res.json()) as MediaOut;
}

export function useUploadExerciseMedia() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: uploadExerciseMediaFile,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: exerciseDetailKeyPrefix });
    },
  });
}

export function useAddExerciseMediaLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ exerciseId, body }: { exerciseId: string; body: LinkBody }) => {
      const { data, error } = await api.POST('/api/v1/exercises/{exercise_id}/media/link', {
        params: { path: { exercise_id: exerciseId } },
        body,
      });
      if (error) throw toApiError(error);
      return data;
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: exerciseDetailKeyPrefix });
    },
  });
}

export function useDeleteExerciseMedia() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ exerciseId, mediaId }: { exerciseId: string; mediaId: string }) => {
      const { error } = await api.DELETE('/api/v1/exercises/{exercise_id}/media/{media_id}', {
        params: { path: { exercise_id: exerciseId, media_id: mediaId } },
      });
      if (error) throw toApiError(error);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: exerciseDetailKeyPrefix });
    },
  });
}
