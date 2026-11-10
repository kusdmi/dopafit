import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { programKey } from '@/entities/program/api/use-program';
import { programsListKey } from '@/entities/program/api/use-programs';
import { server } from '@/app/mocks/server';
import { env } from '@/shared/config/env';
import { resetNetworkStatusForTests } from '@/shared/lib/network/useNetworkStatus';

import { AddToProgramModal } from './AddToProgramModal';

afterEach(() => {
  onlineManager.setOnline(true);
  resetNetworkStatusForTests();
  vi.restoreAllMocks();
});

/** Seeds the query cache so the modal renders own programs + days without network. */
function seed(qc: QueryClient) {
  qc.setQueryData(programsListKey, [
    { id: 'p1', name: 'Моя программа', is_standard: false },
  ]);
  qc.setQueryData(programKey('p1'), {
    id: 'p1',
    name: 'Моя программа',
    days: [{ id: 'd1', name: 'День 1' }],
  });
}

async function pickProgramAndDay() {
  await userEvent.click(await screen.findByText('Моя программа'));
  await userEvent.click(screen.getByText('Выбрать программу'));
  await userEvent.click(await screen.findByText('День 1'));
}

describe('AddToProgramModal offline', () => {
  it('queues the add with a toast and closes instead of hanging on a paused mutation', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    resetNetworkStatusForTests();
    onlineManager.setOnline(false);

    let posts = 0;
    server.use(
      http.post(`${env.apiUrl}/api/v1/programs/:programId/exercises`, () => {
        posts += 1;
        return HttpResponse.json({ ok: true });
      }),
    );

    const onClose = vi.fn();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    seed(qc);
    render(
      <QueryClientProvider client={qc}>
        <AddToProgramModal exerciseId="e1" exerciseName="Жим" onClose={onClose} />
      </QueryClientProvider>,
    );

    await pickProgramAndDay();
    await userEvent.click(screen.getByRole('button', { name: 'Выбрать день' }));

    // Offline the outbox mutation pauses: the modal must fire-and-forget, toast, and
    // close imperatively rather than spinning the confirm button forever. It must
    // NOT advance to the success step (step 3) — no request has actually gone out.
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Добавлено!')).not.toBeInTheDocument();
    expect(posts).toBe(0);
  });

  it('does not re-close when the paused mutation replays on reconnect', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    resetNetworkStatusForTests();
    onlineManager.setOnline(false);

    server.use(
      http.post(`${env.apiUrl}/api/v1/programs/:programId/exercises`, () =>
        HttpResponse.json({ ok: true }),
      ),
    );

    const onClose = vi.fn();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    seed(qc);
    render(
      <QueryClientProvider client={qc}>
        <AddToProgramModal exerciseId="e1" exerciseName="Жим" onClose={onClose} />
      </QueryClientProvider>,
    );

    await pickProgramAndDay();
    await userEvent.click(screen.getByRole('button', { name: 'Выбрать день' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));

    // Reconnect replays the paused add. No onSuccess step-advance observer was
    // attached offline, so the (already-closed) modal must not be closed a second
    // time or resurrect the success step.
    onlineManager.setOnline(true);
    await qc.resumePausedMutations();
    await waitFor(() => expect(qc.isMutating()).toBe(0));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
