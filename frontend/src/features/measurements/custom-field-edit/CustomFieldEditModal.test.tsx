import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { server } from '@/app/mocks/server';
import { env } from '@/shared/config/env';

import { CustomFieldEditModal } from './CustomFieldEditModal';

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return render(ui, { wrapper });
}

/** Track the PUTs that actually reach the network for slot 1, and their bodies. */
function trackUpserts(): { count: () => number; last: () => { name: string; unit: string } } {
  const bodies: { name: string; unit: string }[] = [];
  server.use(
    http.put(`${env.apiUrl}/api/v1/measurements/custom-fields/1`, async ({ request }) => {
      const body = (await request.json()) as { name: string; unit: string };
      bodies.push(body);
      return HttpResponse.json({ slot: 1, ...body });
    }),
  );
  return { count: () => bodies.length, last: () => bodies[bodies.length - 1]! };
}

describe('CustomFieldEditModal validation (TC-054)', () => {
  // Пустой единицы больше не существует как состояния: она выбирается из
  // списка, и поле без сохранённой единицы открывается на «см». Поэтому вместо
  // проверки ошибки проверяем, что такое поле сохраняется сразу.
  it('opens a unit-less field on the default unit and saves it', async () => {
    const tracker = trackUpserts();
    const onClose = vi.fn();
    wrap(
      <CustomFieldEditModal slot={1} isOpen initialName="Бицепс" initialUnit="" onClose={onClose} />,
    );

    expect(screen.getByLabelText('Единица')).toHaveValue('см');

    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(tracker.last()).toEqual({ name: 'Бицепс', unit: 'см' });
  });

  it('does not send a field with an empty name', async () => {
    const tracker = trackUpserts();
    wrap(
      <CustomFieldEditModal slot={1} isOpen initialName="" initialUnit="см" onClose={vi.fn()} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByText('Введите название')).toBeInTheDocument();
    expect(tracker.count()).toBe(0);
  });

  it('sends a valid field and closes', async () => {
    const tracker = trackUpserts();
    const onClose = vi.fn();
    wrap(
      <CustomFieldEditModal
        slot={1}
        isOpen
        initialName="Бицепс"
        initialUnit="см"
        onClose={onClose}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(tracker.count()).toBe(1);
  });
});

describe('CustomFieldEditModal unit select', () => {
  it('offers the prepared units instead of a free-text field', () => {
    wrap(
      <CustomFieldEditModal slot={1} isOpen initialName="Бицепс" initialUnit="см" onClose={vi.fn()} />,
    );

    const select = screen.getByLabelText('Единица');
    expect(select.tagName).toBe('SELECT');
    expect(
      Array.from(select.querySelectorAll('option')).map((o) => o.value),
    ).toEqual(['см', 'мм', 'кг', 'г', '%', '°']);
  });

  it('saves the unit picked from the list', async () => {
    const tracker = trackUpserts();
    const onClose = vi.fn();
    wrap(
      <CustomFieldEditModal slot={1} isOpen initialName="Жир" initialUnit="см" onClose={onClose} />,
    );

    await userEvent.selectOptions(screen.getByLabelText('Единица'), '%');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(tracker.last()).toEqual({ name: 'Жир', unit: '%' });
  });

  // Единица, сохранённая до появления списка, не должна молча подменяться
  // первым вариантом — иначе открытие поля меняло бы смысл его значений.
  it('keeps a stored unit that is not in the list', () => {
    wrap(
      <CustomFieldEditModal slot={1} isOpen initialName="Талия" initialUnit="inch" onClose={vi.fn()} />,
    );

    const select = screen.getByLabelText('Единица');
    expect(select).toHaveValue('inch');
    expect(Array.from(select.querySelectorAll('option')).map((o) => o.value)).toContain('inch');
  });
});
