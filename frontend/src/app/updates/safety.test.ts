import { QueryClient } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { updateBlockedReason } from './safety';

const mocks = vi.hoisted(() => ({
  sessions: {} as Record<string, unknown>,
  failed: vi.fn(async (): Promise<unknown[]> => []),
  photos: vi.fn(async (): Promise<unknown[]> => []),
  storage: vi.fn((): string | null => null),
}));
vi.mock('@/entities/workout/model/store', () => ({
  useWorkoutStore: { getState: () => ({ sessions: mocks.sessions }) },
}));
vi.mock('@/shared/lib/offline/failed-mutations', () => ({ listFailedMutations: mocks.failed }));
vi.mock('@/shared/lib/offline/photo-queue', () => ({ listPendingPhotos: mocks.photos }));
vi.mock('@/shared/lib/platform/storage/errors', () => ({ getStorageError: mocks.storage }));

beforeEach(() => {
  mocks.sessions = {};
  mocks.failed.mockResolvedValue([]);
  mocks.photos.mockResolvedValue([]);
  mocks.storage.mockReturnValue(null);
});

it('allows an idle synchronized app', async () => {
  await expect(updateBlockedReason(new QueryClient())).resolves.toBeNull();
});

it('protects every active workout, including another trainer participant', async () => {
  mocks.sessions = { otherClient: {} };
  await expect(updateBlockedReason(new QueryClient())).resolves.toContain('тренировок');
});

it('blocks pending or paused mutations before persistence', async () => {
  const client = new QueryClient();
  const mutation = client.getMutationCache().build(client, { mutationFn: async () => {} });
  mutation.state = { ...mutation.state, status: 'pending', isPaused: true };
  await expect(updateBlockedReason(client)).resolves.toContain('синхронизации');
});

it.each(['failed', 'photos'] as const)('protects the %s outbox', async (key) => {
  mocks[key].mockResolvedValue([{}]);
  await expect(updateBlockedReason(new QueryClient())).resolves.toContain('фотографии');
});

it('refuses to reload after a storage failure', async () => {
  mocks.storage.mockReturnValue('storage failure');
  await expect(updateBlockedReason(new QueryClient())).resolves.toContain('устройстве');
});

it('rechecks workouts started while reading durable queues', async () => {
  mocks.failed.mockImplementationOnce(async () => {
    mocks.sessions = { newWorkout: {} };
    return [];
  });
  await expect(updateBlockedReason(new QueryClient())).resolves.toContain('тренировок');
});
