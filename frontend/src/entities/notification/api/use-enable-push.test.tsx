import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { registerPush } from '@/shared/lib/platform/push/register-push';
import { pushPermission } from '@/shared/lib/platform/push/permission';

vi.mock('@/shared/lib/platform/push/register-push', () => ({ registerPush: vi.fn() }));
vi.mock('@/shared/lib/platform/push/permission', () => ({ pushPermission: vi.fn(() => 'default') }));

const postMock = vi.fn(async () => ({ error: undefined }));
vi.mock('@/shared/api/client', async (orig) => ({
  ...(await orig<typeof import('@/shared/api/client')>()),
  api: { POST: (...a: unknown[]) => postMock(...(a as [])) },
}));

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

afterEach(() => {
  vi.clearAllMocks();
  asMock(pushPermission).mockReturnValue('default');
});

it('по жесту запрашивает разрешение и отправляет подписку на сервер', async () => {
  // Суть фикса: запрос разрешения идёт из обработчика клика, а не при монтировании —
  // иначе Safari на iOS его игнорирует и системный диалог не появляется вовсе.
  asMock(registerPush).mockResolvedValue({
    platform: 'web',
    token: 'https://push.example/abc',
    keys: { p256dh: 'a', auth: 'b' },
  });
  const { useEnablePush } = await import('./use-enable-push');
  const { result } = renderHook(() => useEnablePush());

  expect(registerPush).not.toHaveBeenCalled();

  asMock(pushPermission).mockReturnValue('granted');
  await act(async () => {
    expect(await result.current.enable()).toBe(true);
  });

  expect(postMock).toHaveBeenCalledWith(
    '/api/v1/notifications/push-token',
    expect.objectContaining({ body: expect.objectContaining({ platform: 'web' }) }),
  );
  await waitFor(() => expect(result.current.permission).toBe('granted'));
  expect(result.current.failed).toBe(false);
});

it('отказ в разрешении отмечается как неудача, токен не отправляется', async () => {
  asMock(registerPush).mockResolvedValue(null);
  asMock(pushPermission).mockReturnValue('denied');
  const { useEnablePush } = await import('./use-enable-push');
  const { result } = renderHook(() => useEnablePush());

  await act(async () => {
    expect(await result.current.enable()).toBe(false);
  });

  expect(postMock).not.toHaveBeenCalled();
  await waitFor(() => expect(result.current.permission).toBe('denied'));
  expect(result.current.failed).toBe(true);
  expect(result.current.pending).toBe(false);
});

it('сбой сети при отправке токена не роняет хук', async () => {
  asMock(registerPush).mockRejectedValue(new Error('offline'));
  const { useEnablePush } = await import('./use-enable-push');
  const { result } = renderHook(() => useEnablePush());

  await act(async () => {
    expect(await result.current.enable()).toBe(false);
  });
  expect(result.current.failed).toBe(true);
  expect(result.current.pending).toBe(false);
});
