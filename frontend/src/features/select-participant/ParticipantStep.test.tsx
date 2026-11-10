import { AppFrame } from '@/shared/ui/primitives';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { useState } from 'react';
import { expect, it } from 'vitest';

import { server } from '@/app/mocks/server';
import { env } from '@/shared/config/env';
import type { Participant } from '@/entities/workout/model/types';

import { FeedbackHost } from '@/shared/ui/feedback';

import { ParticipantStep } from './ParticipantStep';

function Harness({ initial }: { initial: Participant | null }) {
  const [value, setValue] = useState<Participant | null>(initial);
  return (
    <>
      <ParticipantStep value={value} onChange={setValue} />
      <div data-testid="value">{JSON.stringify(value)}</div>
    </>
  );
}

function renderStep(initial: Participant | null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AppFrame>
        <Harness initial={initial} />
        <FeedbackHost />
      </AppFrame>
    </QueryClientProvider>,
  );
}

it('renders the Я/Клиент segment', async () => {
  renderStep(null);
  expect(screen.getByText('Кто тренируется?')).toBeInTheDocument();
  expect(screen.getByText('Я')).toBeInTheDocument();
  expect(screen.getByText('Клиент')).toBeInTheDocument();
});

it('shows the active client list when in client mode', async () => {
  renderStep({ kind: 'client', clientId: 'client-stub-1', clientName: 'Вася' });
  await waitFor(() => expect(screen.getByText('Вася')).toBeInTheDocument());
});

it('shows a warning marker for a client with injuries', async () => {
  renderStep({ kind: 'client', clientId: 'client-stub-1', clientName: 'Вася' });
  await waitFor(() =>
    expect(screen.getByLabelText('Есть ограничения по здоровью')).toBeInTheDocument(),
  );
});

it('shows the contraindications card after selecting a client with injuries', async () => {
  renderStep({ kind: 'client', clientId: 'client-stub-1', clientName: 'Вася' });
  await waitFor(() =>
    expect(
      screen.getByText('Грыжа L4-L5, ограничение по осевой нагрузке'),
    ).toBeInTheDocument(),
  );
});

// Поиска в макете (1009:2149) нет: список клиентов тренера короткий, а поле над
// ним читалось как часть выбора дня ниже.
it('has no search field over the client list', async () => {
  renderStep({ kind: 'client', clientId: 'client-stub-1', clientName: 'Вася' });
  await waitFor(() => expect(screen.getByText('Вася')).toBeInTheDocument());
  expect(screen.queryByPlaceholderText('Поиск по имени')).not.toBeInTheDocument();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
});

// Выбранный клиент залит акцентом (1009:2138: #FAFAF8 на #FF7003). Цвет текста
// должен ЗАМЕНЯТЬСЯ, иначе базовый `text-content` побеждает по позиции в слое
// и в светлой теме на оранжевом получается чёрный текст.
it('swaps the text colour on the selected client instead of stacking it', async () => {
  renderStep({ kind: 'client', clientId: 'client-stub-1', clientName: 'Вася' });
  const selected = await screen.findByRole('radio', { name: /Вася/ });
  expect(selected.className).toContain('bg-brand-400');
  expect(selected.className).toContain('text-chart-1-fg');
  expect(selected.className).not.toContain('text-content');
});

function mockNoClients() {
  server.use(http.get(`${env.apiUrl}/api/v1/clients`, () => HttpResponse.json({ items: [] })));
}

it('marks Клиент unavailable when the trainer has no clients', async () => {
  mockNoClients();
  renderStep(null);

  const clientButton = await screen.findByRole('radio', { name: 'Клиент' });
  await waitFor(() => expect(clientButton).toHaveAttribute('aria-disabled', 'true'));
  // Пока не нажали — причина не занимает место на экране.
  expect(screen.queryByText(/Пока нет клиентов/)).not.toBeInTheDocument();
});

// `aria-disabled`, а не `disabled`: настоящий disabled не отдаёт события, и
// объяснить причину по клику было бы нечем.
it('explains the reason in a toast when the disabled Клиент is clicked', async () => {
  mockNoClients();
  renderStep(null);

  const clientButton = await screen.findByRole('radio', { name: 'Клиент' });
  await waitFor(() => expect(clientButton).toHaveAttribute('aria-disabled', 'true'));

  await userEvent.click(clientButton);

  expect(await screen.findByText(/Пока нет клиентов/)).toBeInTheDocument();
  // Режим не переключился: клиента выбрать всё равно нельзя.
  expect(clientButton).toHaveAttribute('aria-checked', 'false');
});

it('keeps Клиент available while the client list is still loading', () => {
  renderStep(null);
  expect(screen.getByRole('radio', { name: 'Клиент' })).not.toHaveAttribute(
    'aria-disabled',
    'true',
  );
});
