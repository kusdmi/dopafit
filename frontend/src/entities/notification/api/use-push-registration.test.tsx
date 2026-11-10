import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { registerPush } from '@/shared/lib/platform/push/register-push';

vi.mock('@/shared/lib/platform/push/register-push', () => ({ registerPush: vi.fn() }));

const postMock = vi.fn(async () => ({ error: undefined }));
vi.mock('@/shared/api/client', async (orig) => ({
  ...(await orig<typeof import('@/shared/api/client')>()),
  api: { POST: (...a: unknown[]) => postMock(...(a as [])) },
}));

// Mock session store: authenticated. Mirror the shape used by other tests.
const sessionState = { isAuthenticated: true };
vi.mock('@/entities/session/model/store', () => ({
  useSessionStore: (sel: (s: typeof sessionState) => unknown) => sel(sessionState),
}));

// Mock notification settings: push_enabled true by default; overridable per test.
const settingsState: { data: { push_enabled: boolean } | undefined } = {
  data: { push_enabled: true },
};
vi.mock('@/entities/notification/api/use-notification-settings', () => ({
  useNotificationSettings: () => settingsState,
}));

afterEach(() => {
  vi.clearAllMocks();
  sessionState.isAuthenticated = true;
  settingsState.data = { push_enabled: true };
});

it('регистрирует токен когда есть сессия и push_enabled=true', async () => {
  (registerPush as ReturnType<typeof vi.fn>).mockResolvedValue({
    platform: 'web', token: 'https://p/x', keys: { p256dh: 'a', auth: 'b' },
  });
  const { usePushRegistration } = await import('./use-push-registration');
  renderHook(() => usePushRegistration());
  await waitFor(() =>
    expect(postMock).toHaveBeenCalledWith(
      '/api/v1/notifications/push-token',
      expect.objectContaining({ body: expect.objectContaining({ platform: 'web' }) }),
    ),
  );
});

it('НЕ регистрирует при push_enabled=false', async () => {
  settingsState.data = { push_enabled: false };
  const { usePushRegistration } = await import('./use-push-registration');
  renderHook(() => usePushRegistration());
  await new Promise((r) => setTimeout(r, 20));
  expect(registerPush).not.toHaveBeenCalled();
  expect(postMock).not.toHaveBeenCalled();
});

it('НЕ регистрирует без аутентификации', async () => {
  sessionState.isAuthenticated = false;
  const { usePushRegistration } = await import('./use-push-registration');
  renderHook(() => usePushRegistration());
  await new Promise((r) => setTimeout(r, 20));
  expect(registerPush).not.toHaveBeenCalled();
});
