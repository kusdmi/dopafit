import 'fake-indexeddb/auto';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';

import { server } from '@/app/mocks/server';
import { env } from '@/shared/config/env';
import { clearPhotoQueue, enqueuePhoto } from '@/shared/lib/offline/photo-queue';
import { pickPhoto } from '@/shared/lib/platform/camera/pick-photo';

import { PhotoPicker } from './PhotoPicker';

vi.mock('@/shared/lib/platform/camera/pick-photo', () => ({ pickPhoto: vi.fn() }));

// Spy on enqueuePhoto while keeping the rest of the queue module (clearPhotoQueue,
// dequeueForMeasurement) real so the delete tests still exercise the real queue.
vi.mock('@/shared/lib/offline/photo-queue', async (orig) => ({
  ...(await orig<typeof import('@/shared/lib/offline/photo-queue')>()),
  enqueuePhoto: vi.fn(async () => {}),
}));

// useToast renders a toast that jsdom cannot assert on directly,
// so we spy on the present() callback it returns. Replacing the primitives module
// wholesale means this file must also re-supply the facades the ConfirmDialog tree
// needs (Dialog/ActionButton/Spinner) that the existing confirm/cancel cases rely on.
const present = vi.fn();
vi.mock('@/shared/ui/primitives', async (importActual) => {
  const actual = await importActual<typeof import('@/shared/ui/primitives')>();
  const { createElement } = await import('react');

  const Dialog = ({
    isOpen,
    children,
    onClose: _d,
    ...rest
  }: Record<string, unknown> & { children?: unknown; isOpen?: boolean }) =>
    isOpen
      ? createElement('div', { role: 'dialog', ...rest } as Record<string, unknown>, children as never)
      : null;

  const ActionButton = ({
    children,
    expand: _expand,
    fill: _fill,
    color: _color,
    routerLink: _routerLink,
    ...rest
  }: Record<string, unknown> & { children?: unknown }) =>
    createElement('button', rest as Record<string, unknown>, children as never);

  const Spinner = ({ name: _name, ...rest }: Record<string, unknown>) =>
    createElement('span', { role: 'progressbar', ...rest });

  return {
    ...actual,
    useToast: () => [present, vi.fn()] as const,
    Dialog,
    ActionButton,
    Spinner,
  };
});

const PHOTO_URL = '/api/v1/measurements/m1/photos/front/content';

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return render(ui, { wrapper });
}

describe('PhotoPicker delete', () => {
  beforeEach(async () => {
    present.mockClear();
    vi.mocked(pickPhoto).mockReset();
    vi.mocked(enqueuePhoto).mockClear();
    await clearPhotoQueue();
  });
  afterEach(async () => {
    await clearPhotoQueue();
  });

  it('sends DELETE and removes the preview when confirmed', async () => {
    const deletedPaths: string[] = [];
    server.use(
      http.delete(
        `${env.apiUrl}/api/v1/measurements/:id/photos/:kind`,
        ({ params }) => {
          deletedPaths.push(`${params.id}/${params.kind}`);
          return HttpResponse.json({ ok: true });
        },
      ),
    );

    wrap(<PhotoPicker measurementId="m1" serverPhotos={[{ kind: 'front', url: PHOTO_URL }]} />);

    expect(screen.getByAltText('Спереди')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Удалить фото: Спереди/ }));
    // Confirm in the dialog (destructive confirm label is "Удалить").
    await userEvent.click(screen.getByRole('button', { name: 'Удалить' }));

    await waitFor(() => {
      expect(deletedPaths).toContain('m1/front');
      expect(screen.queryByAltText('Спереди')).not.toBeInTheDocument();
    });
  });

  it('shows a toast and keeps the preview when DELETE fails (non-404)', async () => {
    server.use(
      http.delete(`${env.apiUrl}/api/v1/measurements/:id/photos/:kind`, () =>
        HttpResponse.json({ detail: 'boom' }, { status: 500 }),
      ),
    );

    wrap(<PhotoPicker measurementId="m1" serverPhotos={[{ kind: 'front', url: PHOTO_URL }]} />);

    expect(screen.getByAltText('Спереди')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Удалить фото: Спереди/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Удалить' }));

    // Error toast is shown and the dialog closes (does not hang).
    await waitFor(() => {
      expect(present).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Не удалось удалить фото' }),
      );
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // The server photo is NOT removed: nothing was deleted server-side, so it stays.
    expect(screen.getByAltText('Спереди')).toBeInTheDocument();
  });

  it('кнопка «Выбрать» зовёт pickPhoto и кладёт Blob в очередь', async () => {
    const blob = new Blob(['x'], { type: 'image/jpeg' });
    (pickPhoto as ReturnType<typeof vi.fn>).mockResolvedValue(blob);

    wrap(<PhotoPicker measurementId="m1" />);

    await userEvent.click(screen.getAllByRole('button', { name: /Выбрать/ })[0]);

    await waitFor(() =>
      expect(enqueuePhoto).toHaveBeenCalledWith(
        expect.objectContaining({ measurementClientId: 'm1', blob, contentType: 'image/jpeg' }),
      ),
    );
  });

  it('does not send DELETE when cancelled', async () => {
    let called = false;
    server.use(
      http.delete(`${env.apiUrl}/api/v1/measurements/:id/photos/:kind`, () => {
        called = true;
        return HttpResponse.json({ ok: true });
      }),
    );

    wrap(<PhotoPicker measurementId="m1" serverPhotos={[{ kind: 'front', url: PHOTO_URL }]} />);

    await userEvent.click(screen.getByRole('button', { name: /Удалить фото: Спереди/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(called).toBe(false);
    expect(screen.getByAltText('Спереди')).toBeInTheDocument();
  });
});
