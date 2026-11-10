import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { expect, it, vi } from 'vitest';

import { server } from '@/app/mocks/server';
import { env } from '@/shared/config/env';

import { SendRequestForm } from './SendRequestForm';

// Тост в jsdom не выносит текст в DOM, поэтому перехватываем present() —
// тот же приём, что в CreateExerciseModal.test.tsx.
const present = vi.fn();
vi.mock('@/shared/ui/primitives', async (importActual) => {
  const actual = await importActual<typeof import('@/shared/ui/primitives')>();
  return { ...actual, useToast: () => [present, vi.fn()] as const };
});

function renderForm() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SendRequestForm />
    </QueryClientProvider>,
  );
}

/** Заполняет поле и отправляет форму. */
function submit(query = 'kto@example.com') {
  renderForm();
  fireEvent.change(screen.getByLabelText('Телефон или email'), { target: { value: query } });
  fireEvent.click(screen.getByText('Отправить запрос'));
}

function failWith(status: number, code: string, message: string, reason: string) {
  server.use(
    http.post(`${env.apiUrl}/api/v1/link-requests`, () =>
      HttpResponse.json({ code, message, details: { reason } }, { status }),
    ),
  );
}

it('переводит уже отправленный запрос на русский по details.reason', async () => {
  failWith(409, 'conflict', 'A pending request already exists', 'link_request_pending');
  submit();

  await waitFor(() =>
    expect(present).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Запрос уже отправлен и ждёт ответа' }),
    ),
  );
});

it('переводит уже существующую связь', async () => {
  failWith(409, 'conflict', 'Already linked', 'already_linked');
  submit();

  await waitFor(() =>
    expect(present).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Вы уже связаны с этим человеком' }),
    ),
  );
});

it('переводит отсутствующий аккаунт', async () => {
  failWith(404, 'not_found', 'User not found', 'account_not_found');
  submit();

  await waitFor(() =>
    expect(present).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Аккаунт с такими данными не найден' }),
    ),
  );
});

it('использует русское общее сообщение, когда признака нет', async () => {
  server.use(
    http.post(`${env.apiUrl}/api/v1/link-requests`, () =>
      HttpResponse.json(
        { code: 'validation_error', message: 'A link must be between a trainer and a client' },
        { status: 422 },
      ),
    ),
  );
  submit();

  await waitFor(() =>
    expect(present).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Проверьте введённые данные' }),
    ),
  );
});
