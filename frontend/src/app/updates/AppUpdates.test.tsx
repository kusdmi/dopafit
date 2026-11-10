import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { watchAppUpdates } from '@/shared/lib/platform/app-update/watch';
import { AppUpdates } from './AppUpdates';

vi.mock('@/shared/lib/platform/app-update/watch', () => ({ watchAppUpdates: vi.fn() }));

beforeEach(() => vi.stubEnv('PROD', true));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

it('shows a persistent update notice and asks before losing unsaved form input', async () => {
  const apply = vi.fn(async () => {});
  const dispose = vi.fn();
  vi.mocked(watchAppUpdates).mockReturnValue({ apply, dispose });
  const client = new QueryClient();
  const view = render(
    <QueryClientProvider client={client}>
      <AppUpdates ready />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(watchAppUpdates).toHaveBeenCalledOnce());
  act(() =>
    vi
      .mocked(watchAppUpdates)
      .mock.calls[0][0].changed({ release: 'release-next', applying: false, error: null }),
  );
  expect(screen.getByRole('complementary', { name: 'Обновление приложения' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Обновить' }));
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByText(/Сохраните изменения/)).toBeVisible();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Позже' }));
  expect(apply).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Обновить' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Обновить' }));
  await waitFor(() => expect(apply).toHaveBeenCalledOnce());
  view.unmount();
  expect(dispose).toHaveBeenCalledOnce();
});
