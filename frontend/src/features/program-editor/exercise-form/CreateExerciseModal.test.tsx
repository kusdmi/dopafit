import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { expect, it, vi } from 'vitest';

import { server } from '@/app/mocks/server';
import { env } from '@/shared/config/env';

import { CreateExerciseModal } from './CreateExerciseModal';

// useToast is spied on through the present() callback it returns. Replacing the
// primitives module wholesale means this file must also re-supply the facades the
// modal and form need (modal, button, input/textarea) as plain native elements.
const present = vi.fn();
vi.mock('@/shared/ui/primitives', async (importActual) => {
  const actual = await importActual<typeof import('@/shared/ui/primitives')>();
  const { createElement, Fragment } = await import('react');

  const passthrough =
    (tag: string) =>
    ({ children, ...rest }: Record<string, unknown> & { children?: unknown }) =>
      createElement(tag, rest as Record<string, unknown>, children as never);

  const ActionButton = ({
    children,
    expand: _expand,
    fill: _fill,
    color: _color,
    routerLink: _routerLink,
    ...rest
  }: Record<string, unknown> & { children?: unknown }) =>
    createElement('button', rest as Record<string, unknown>, children as never);

  const IonItem = passthrough('div');

  const IonInput = ({
    label,
    errorText,
    labelPlacement: _lp,
    onChange,
    onIonBlur: _onIonBlur,
    ...rest
  }: Record<string, unknown>) => {
    const handleInput = (e: { target: { value: string } }) =>
      (onChange as ((ev: { detail: { value: string } }) => void) | undefined)?.({
        detail: { value: e.target.value },
      });
    return createElement(
      Fragment,
      null,
      createElement('input', {
        'aria-label': label,
        onChange: handleInput,
        ...rest,
      } as Record<string, unknown>),
      errorText ? createElement('span', null, errorText as never) : null,
    );
  };

  const IonTextarea = ({
    label,
    errorText: _e,
    labelPlacement: _lp,
    autoGrow: _ag,
    onChange,
    onIonBlur: _ob,
    ...rest
  }: Record<string, unknown>) =>
    createElement('textarea', {
      'aria-label': label,
      onChange: (e: { target: { value: string } }) =>
        (onChange as ((ev: { detail: { value: string } }) => void) | undefined)?.({
          detail: { value: e.target.value },
        }),
      ...rest,
    } as Record<string, unknown>);

  const Dialog = ({
    isOpen,
    children,
    onClose: _d,
    ...rest
  }: Record<string, unknown> & { children?: unknown; isOpen?: boolean }) =>
    isOpen
      ? createElement('div', { role: 'dialog', ...rest } as Record<string, unknown>, children as never)
      : null;

  const Icon = ({ icon: _icon, ...rest }: Record<string, unknown> & { icon?: unknown }) =>
    createElement('span', { 'aria-hidden': 'true', ...rest });

  return {
    ...actual,
    useToast: () => [present, vi.fn()] as const,
    ActionButton,
    IonItem,
    IonInput,
    IonTextarea,
    Dialog,
    Icon,
    PageHeader: passthrough('div'),
    Toolbar: passthrough('div'),
    PageTitle: passthrough('div'),
    ToolbarActions: passthrough('div'),
    PageContent: passthrough('div'),
    PageFooter: passthrough('div'),
  };
});

function renderModal(onCreated = () => {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CreateExerciseModal isOpen onClose={() => {}} onCreated={onCreated} />
    </QueryClientProvider>,
  );
}

it('shows a limit toast on 409', async () => {
  server.use(
    http.post(`${env.apiUrl}/api/v1/exercises`, () =>
      HttpResponse.json(
        {
          code: 'conflict',
          message: 'limit',
          details: { reason: 'custom_exercise_limit', limit: 10 },
        },
        { status: 409 },
      ),
    ),
  );
  renderModal();

  fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'X' } });
  // Categories come from the MSW mock; wait for them to load, then pick one.
  await screen.findByRole('option', { name: 'Грудь' });
  fireEvent.change(screen.getByLabelText('Категория'), { target: { value: 'cat-chest' } });
  fireEvent.click(screen.getByText('Сохранить'));

  await waitFor(() =>
    expect(present).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Достигнут лимит пользовательских упражнений',
      }),
    ),
  );
});

it('creates the exercise and reports the id on success', async () => {
  const onCreated = vi.fn();
  renderModal(onCreated);

  fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Новое' } });
  await screen.findByRole('option', { name: 'Грудь' });
  fireEvent.change(screen.getByLabelText('Категория'), { target: { value: 'cat-chest' } });
  fireEvent.click(screen.getByText('Сохранить'));

  await waitFor(() => expect(onCreated).toHaveBeenCalledWith(expect.any(String)));
});

it('treats a 422 on the video link as non-fatal: still creates and warns', async () => {
  // The exercise itself is created (201), but the link points at a
  // non-whitelisted domain so POST /media/link returns 422.
  server.use(
    http.post(`${env.apiUrl}/api/v1/exercises/:id/media/link`, () =>
      HttpResponse.json(
        { code: 'unprocessable_entity', message: 'invalid url' },
        { status: 422 },
      ),
    ),
  );

  const onCreated = vi.fn();
  const onClose = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <CreateExerciseModal isOpen onClose={onClose} onCreated={onCreated} />
    </QueryClientProvider>,
  );

  fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'С видео' } });
  await screen.findByRole('option', { name: 'Грудь' });
  fireEvent.change(screen.getByLabelText('Категория'), { target: { value: 'cat-chest' } });
  fireEvent.change(screen.getByLabelText('Ссылка на видео'), {
    target: { value: 'https://evil.example.com/v' },
  });
  fireEvent.blur(screen.getByLabelText('Ссылка на видео'));
  fireEvent.click(screen.getByText('Сохранить'));

  // The exercise is created and reported, the modal closes…
  await waitFor(() => expect(onCreated).toHaveBeenCalledWith(expect.any(String)));
  await waitFor(() => expect(onClose).toHaveBeenCalled());

  // …and the user sees a warning about the link, not a generic failure.
  await waitFor(() =>
    expect(present).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Упражнение создано, но ссылка на видео не добавлена (недопустимый адрес)',
      }),
    ),
  );
  expect(present).not.toHaveBeenCalledWith(
    expect.objectContaining({ message: 'Не удалось сохранить упражнение' }),
  );
});

// The real Dialog keeps its children mounted while hidden (it does not unmount
// on isOpen=false). The shared Dialog mock above unmounts on close, which would
// hide the persistence bug, so this suite overrides it with a variant that always
// renders its children — exactly like the real component — to exercise the reset.
vi.mock('@/shared/ui/Modal', async () => {
  const { createElement } = await import('react');
  return {
    Modal: ({ children }: { children?: unknown }) =>
      createElement('div', { role: 'dialog' }, children as never),
  };
});

it('resets pending media and form fields on each reopen', async () => {
  // With the children kept mounted (as in the real Dialog), the previous name
  // and the previously-attached link would otherwise leak into the next exercise.
  let linkCalls = 0;
  server.use(
    http.post(`${env.apiUrl}/api/v1/exercises/:id/media/link`, () => {
      linkCalls += 1;
      return HttpResponse.json({ id: 'media-1', kind: 'iframe', url: 'x', position: 0 });
    }),
  );

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const renderAt = (isOpen: boolean) => (
    <QueryClientProvider client={qc}>
      <CreateExerciseModal isOpen={isOpen} onClose={() => {}} onCreated={() => {}} />
    </QueryClientProvider>
  );
  const { rerender } = render(renderAt(true));

  // First exercise: name + category + an attached video link, then create.
  fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Первое' } });
  await screen.findByRole('option', { name: 'Грудь' });
  fireEvent.change(screen.getByLabelText('Категория'), { target: { value: 'cat-chest' } });
  fireEvent.change(screen.getByLabelText('Ссылка на видео'), {
    target: { value: 'https://youtu.be/abc' },
  });
  fireEvent.blur(screen.getByLabelText('Ссылка на видео'));
  fireEvent.click(screen.getByText('Сохранить'));
  await waitFor(() => expect(linkCalls).toBe(1));

  // Close and reopen the modal (children stay mounted in between).
  act(() => rerender(renderAt(false)));
  act(() => rerender(renderAt(true)));

  // The name field is empty again — the form was reset, not carried over.
  expect((screen.getByLabelText('Название') as HTMLInputElement).value).toBe('');

  // Create a second exercise WITHOUT re-entering a link. If pendingLink had
  // persisted, the link endpoint would be called a second time.
  fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Второе' } });
  fireEvent.change(screen.getByLabelText('Категория'), { target: { value: 'cat-chest' } });
  fireEvent.click(screen.getByText('Сохранить'));
  await waitFor(() =>
    expect((screen.getByLabelText('Название') as HTMLInputElement).value).toBe('Второе'),
  );
  // Give any stray link mutation a chance to fire before asserting it did not.
  await new Promise((r) => setTimeout(r, 50));
  expect(linkCalls).toBe(1);
});
