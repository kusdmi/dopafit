import 'fake-indexeddb/auto';
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { server } from '@/app/mocks/server';
import { saveMeasurementMutationFn } from '@/entities/measurement/api/use-save-measurement';
import { updateMeasurementMutationFn } from '@/entities/measurement/api/use-update-measurement';
import { env } from '@/shared/config/env';
import { registerMeasurementMutationDefaults } from '@/shared/lib/offline/setupOffline';

import { MeasurementsPage } from './MeasurementsPage';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerMeasurementMutationDefaults(qc, {
    save: saveMeasurementMutationFn as (value: unknown) => Promise<unknown>,
    update: updateMeasurementMutationFn as (value: unknown) => Promise<unknown>,
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
  return { ...render(<MeasurementsPage />, { wrapper }), qc };
}

afterEach(() => {
  onlineManager.setOnline(true);
});

describe('MeasurementsPage', () => {
  it('deletes a measurement and refreshes history and analytics', async () => {
    const { qc } = renderPage();
    await screen.findByLabelText('Дата');
    fireEvent.change(screen.getByLabelText('Дата'), { target: { value: '2026-06-22' } });
    await userEvent.type(screen.getByLabelText('Вес'), '78.5');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    const row = await screen.findByRole('button', { name: /22 июн\. 2026/ });
    await waitFor(() =>
      expect(screen.queryByText('Ожидает синхронизации')).not.toBeInTheDocument(),
    );
    const invalidate = vi.spyOn(qc, 'invalidateQueries');

    await userEvent.click(row);
    await userEvent.click(screen.getByRole('button', { name: 'Удалить замер' }));
    await userEvent.click(screen.getByRole('button', { name: 'Удалить' }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /22 июн\. 2026/ })).not.toBeInTheDocument(),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['analytics'] });
  });

  it('moves a loaded measurement to a free date without losing its values', async () => {
    renderPage();
    await screen.findByLabelText('Дата');
    fireEvent.change(screen.getByLabelText('Дата'), { target: { value: '2026-06-20' } });
    await userEvent.type(screen.getByLabelText('Вес'), '82');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    const original = await screen.findByRole('button', { name: /20 июн\. 2026/ });
    await waitFor(() =>
      expect(screen.queryByText('Ожидает синхронизации')).not.toBeInTheDocument(),
    );

    await userEvent.click(original);
    await userEvent.click(screen.getByRole('button', { name: 'Загрузить для редактирования' }));
    fireEvent.change(screen.getByLabelText('Дата'), { target: { value: '2026-06-21' } });
    expect(screen.getByLabelText('Вес')).toHaveValue('82');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    const moved = await screen.findByRole('button', { name: /21 июн\. 2026/ });
    expect(moved).toHaveTextContent('82 кг');
    expect(screen.queryByRole('button', { name: /20 июн\. 2026/ })).not.toBeInTheDocument();
  });

  it('saves a measurement and shows it in history', async () => {
    renderPage();
    // The form mounts only after the measurements query resolves (it gates on loading
    // so today's record is prefilled into defaultValues on the single mount).
    const dateInput = await screen.findByLabelText('Дата');
    fireEvent.change(dateInput, { target: { value: '2026-06-13' } });
    await userEvent.type(screen.getByLabelText('Вес'), '80.5');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    // The history row splits the date into year and day visually, so match on
    // the row's accessible name rather than a rendered date string.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /13 июн\. 2026/ })).toBeInTheDocument(),
    );
  });

  it('labels history values in metric units', async () => {
    // The app is metric end to end: the contract stores kilograms and
    // centimetres, so the history row must say so rather than echo a
    // per-user unit preference.
    renderPage();
    await screen.findByLabelText('Дата');
    fireEvent.change(screen.getByLabelText('Дата'), { target: { value: '2026-07-02' } });
    await userEvent.type(screen.getByLabelText('Вес'), '80');
    await userEvent.type(screen.getByLabelText('Талия'), '75');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    const row = await screen.findByRole('button', { name: /2 июл\. 2026/ });
    await waitFor(() => expect(row).toHaveTextContent('80 кг'));
    expect(row).toHaveTextContent('75 см');
  });

  it('falls back to whatever a record has when no headline metric is present', async () => {
    // A user tracking only a custom field would otherwise get a blank history
    // row — the data is stored, so an empty card reads as data loss.
    server.use(
      http.get(`${env.apiUrl}/api/v1/measurements`, () =>
        HttpResponse.json({
          items: [
            {
              id: 'm-custom',
              date: '2026-07-02',
              custom_values: [{ slot: 1, name: 'Бицепс', unit: 'см', value: 37.5 }],
              photos: [],
            },
          ],
          total: 1,
        }),
      ),
    );
    renderPage();

    const row = await screen.findByRole('button', { name: /2 июл\. 2026/ });
    await waitFor(() => expect(row).toHaveTextContent('Бицепс'));
    expect(row).toHaveTextContent('37.5 см');
  });

  it("prefills today's record into the form on mount", async () => {
    // Save today's record, then remount: the form must come up pre-filled, not blank.
    // Regression guard — a post-mount prefill effect used to race with react-hook-form
    // marking the empty number fields dirty, which silently left the form empty.
    const today = new Date().toISOString().slice(0, 10);
    renderPage();
    await screen.findByLabelText('Дата');
    fireEvent.change(screen.getByLabelText('Дата'), { target: { value: today } });
    await userEvent.type(screen.getByLabelText('Вес'), '77');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() =>
      expect(screen.queryByText('Ожидает синхронизации')).not.toBeInTheDocument(),
    );

    cleanup();
    renderPage();
    await screen.findByLabelText('Дата');
    await waitFor(() => expect(screen.getByLabelText('Вес')).toHaveValue('77'));
  });

  it('prefills an occupied date and shows the dialog when editing it', async () => {
    // First render: save a measurement on 2026-06-20 to populate the MSW store.
    renderPage();
    await screen.findByLabelText('Дата');
    fireEvent.change(screen.getByLabelText('Дата'), { target: { value: '2026-06-20' } });
    await userEvent.type(screen.getByLabelText('Вес'), '82');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    // Wait for the item to appear settled (no pending badge)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /20 июн\. 2026/ })).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.queryByText('Ожидает синхронизации')).not.toBeInTheDocument(),
    );

    // Remount: the form should prefill today's record, but selecting 2026-06-20
    // below loads that record for editing.
    cleanup();
    renderPage();
    await screen.findByLabelText('Дата');

    // Selecting the occupied date prefills the stored value into the form.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /20 июн\. 2026/ })).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByLabelText('Дата'), { target: { value: '2026-06-20' } });
    await waitFor(() => expect(screen.getByLabelText('Вес')).toHaveValue('82'));

    // Editing the value and saving shows the before/after dialog.
    const weightInput = screen.getByLabelText('Вес');
    await userEvent.clear(weightInput);
    await userEvent.type(weightInput, '80.5');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(screen.getByText('Изменения замера')).toBeInTheDocument());

    // Confirm overwrites and closes the dialog
    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить' }));
    await waitFor(() => expect(screen.queryByText('Изменения замера')).not.toBeInTheDocument());
  });

  it('keeps the overwrite dialog open when the PUT update fails', async () => {
    // Seed a record on 2026-06-25, then edit it so the overwrite dialog shows.
    renderPage();
    await screen.findByLabelText('Дата');
    fireEvent.change(screen.getByLabelText('Дата'), { target: { value: '2026-06-25' } });
    await userEvent.type(screen.getByLabelText('Вес'), '90');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() =>
      expect(screen.queryByText('Ожидает синхронизации')).not.toBeInTheDocument(),
    );

    cleanup();
    renderPage();
    await screen.findByLabelText('Дата');
    fireEvent.change(screen.getByLabelText('Дата'), { target: { value: '2026-06-25' } });
    await waitFor(() => expect(screen.getByLabelText('Вес')).toHaveValue('90'));

    const weightInput = screen.getByLabelText('Вес');
    await userEvent.clear(weightInput);
    await userEvent.type(weightInput, '88');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(screen.getByText('Изменения замера')).toBeInTheDocument());

    // Make the PUT fail: the dialog must stay open so the edit isn't silently lost.
    server.use(
      http.put(`${env.apiUrl}/api/v1/measurements/:id`, () =>
        HttpResponse.json(
          { code: 'server_error', message: 'boom', details: null },
          { status: 500 },
        ),
      ),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить' }));

    // The dialog remains open (the mutation rejected) instead of closing and
    // pretending the edit was saved.
    await waitFor(() => expect(screen.getByText('Изменения замера')).toBeInTheDocument());
    // Give any (incorrect) close a chance to run, then re-assert it is still open.
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByText('Изменения замера')).toBeInTheDocument();
  });

  it('closes the overwrite dialog when the network drops mid-update (edit is queued)', async () => {
    // Seed a record, then edit it so the overwrite dialog appears.
    renderPage();
    await screen.findByLabelText('Дата');
    fireEvent.change(screen.getByLabelText('Дата'), { target: { value: '2026-06-26' } });
    await userEvent.type(screen.getByLabelText('Вес'), '80');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() =>
      expect(screen.queryByText('Ожидает синхронизации')).not.toBeInTheDocument(),
    );

    cleanup();
    renderPage();
    await screen.findByLabelText('Дата');
    fireEvent.change(screen.getByLabelText('Дата'), { target: { value: '2026-06-26' } });
    await waitFor(() => expect(screen.getByLabelText('Вес')).toHaveValue('80'));
    await userEvent.clear(screen.getByLabelText('Вес'));
    await userEvent.type(screen.getByLabelText('Вес'), '81');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(screen.getByText('Изменения замера')).toBeInTheDocument());

    // Hang the PUT so the mutation is genuinely in flight when the network drops.
    server.use(http.put(`${env.apiUrl}/api/v1/measurements/:id`, () => new Promise(() => {})));

    // Guard against the m4 regression: taking the offline branch of Promise.race
    // must not leave the losing mutateAsync promise able to surface a late
    // unhandled rejection. Assert nothing bubbles up across the close.
    const unhandled: unknown[] = [];
    const onUnhandled = (e: PromiseRejectionEvent) => {
      e.preventDefault();
      unhandled.push(e.reason);
    };
    window.addEventListener('unhandledrejection', onUnhandled);

    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить' }));
    // Network drops mid-request: the edit is safely queued, so the dialog must
    // close instead of hanging open forever on a paused mutation.
    act(() => onlineManager.setOnline(false));

    await waitFor(() => expect(screen.queryByText('Изменения замера')).not.toBeInTheDocument());

    await new Promise((r) => setTimeout(r, 0));
    window.removeEventListener('unhandledrejection', onUnhandled);
    expect(unhandled).toHaveLength(0);
  });
});
