import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SaveMeasurementForm } from './SaveMeasurementForm';

const mockCustomFields = vi.fn();
vi.mock('@/entities/measurement/api/use-custom-fields', () => ({
  useCustomFields: () => mockCustomFields(),
  useUpsertCustomField: () => ({ mutate: vi.fn() }),
}));

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return render(ui, { wrapper });
}

describe('SaveMeasurementForm custom values', () => {
  beforeEach(() => {
    mockCustomFields.mockReturnValue({ data: [] });
  });

  it('submits a base field value', async () => {
    const onSubmit = vi.fn();
    wrap(<SaveMeasurementForm onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText('Дата'), { target: { value: '2026-06-13' } });
    await userEvent.type(screen.getByLabelText('Вес'), '80.5');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.weight).toBe(80.5);
    expect(payload.id).toBeTruthy();
    expect(Array.isArray(payload.custom_values)).toBe(true);
  });

  it('includes a filled custom slot value in custom_values', async () => {
    mockCustomFields.mockReturnValue({
      data: [{ slot: 1, name: 'Бицепс', unit: 'см' }],
    });
    const onSubmit = vi.fn();
    wrap(<SaveMeasurementForm onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText('Дата'), { target: { value: '2026-06-13' } });
    await userEvent.type(screen.getByLabelText('Бицепс, см'), '38');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.custom_values).toEqual([{ slot: 1, name: 'Бицепс', unit: 'см', value: 38 }]);
  });
});

// Смена даты перепривязывает форму к записи за выбранный день: поля, которых в
// той записи нет, обязаны очиститься, а не донести значения предыдущей даты.
describe('SaveMeasurementForm date rebinding', () => {
  beforeEach(() => {
    mockCustomFields.mockReturnValue({ data: [{ slot: 1, name: 'Бицепс', unit: 'см' }] });
  });

  const recordA = {
    id: 'a',
    date: '2026-06-10',
    height: 175,
    weight: 80,
    waist: 82,
    custom_values: [{ slot: 1, name: 'Бицепс', unit: 'см', value: 38 }],
    photos: [{ kind: 'front', url: '/api/v1/measurements/a/photos/front/content' }],
  };
  // За 11-е записан только вес — остальные поля в этот день пусты.
  const recordB = {
    id: 'b',
    date: '2026-06-11',
    weight: 79,
    custom_values: [],
    photos: [],
  };

  function findRecordByDate(date: string) {
    return [recordA, recordB].find((r) => r.date === date) as never;
  }

  it('clears fields absent from the record picked by the new date', () => {
    wrap(
      <SaveMeasurementForm
        onSubmit={vi.fn()}
        initialRecord={recordA as never}
        findRecordByDate={findRecordByDate}
      />,
    );

    expect(screen.getByLabelText('Рост')).toHaveValue('175');
    expect(screen.getByLabelText('Талия')).toHaveValue('82');
    expect(screen.getByLabelText('Бицепс, см')).toHaveValue('38');

    fireEvent.change(screen.getByLabelText('Дата'), { target: { value: '2026-06-11' } });

    expect(screen.getByLabelText('Вес')).toHaveValue('79');
    expect(screen.getByLabelText('Рост')).toHaveValue('');
    expect(screen.getByLabelText('Талия')).toHaveValue('');
    expect(screen.getByLabelText('Бицепс, см')).toHaveValue('');
  });

  it('clears every field when the new date has no record at all', () => {
    wrap(
      <SaveMeasurementForm
        onSubmit={vi.fn()}
        initialRecord={recordA as never}
        findRecordByDate={findRecordByDate}
      />,
    );

    fireEvent.change(screen.getByLabelText('Дата'), { target: { value: '2026-06-12' } });

    expect(screen.getByLabelText('Дата')).toHaveValue('2026-06-12');
    expect(screen.getByLabelText('Рост')).toHaveValue('');
    expect(screen.getByLabelText('Вес')).toHaveValue('');
    expect(screen.getByLabelText('Бицепс, см')).toHaveValue('');
  });

  it('keeps an explicitly loaded history record when moving it to a free date', async () => {
    const onSubmit = vi.fn();
    wrap(
      <SaveMeasurementForm
        onSubmit={onSubmit}
        initialRecord={recordA as never}
        allowDateMove
        findRecordByDate={findRecordByDate}
      />,
    );

    fireEvent.change(screen.getByLabelText('Дата'), { target: { value: '2026-06-12' } });
    expect(screen.getByLabelText('Вес')).toHaveValue('80');
    expect(screen.getByLabelText('Рост')).toHaveValue('175');
    expect(screen.getByLabelText('Бицепс, см')).toHaveValue('38');

    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await vi.waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'a', date: '2026-06-12', weight: 80, height: 175 }),
      ),
    );
  });

  it('prefills the selected date when its record arrives after the date change', async () => {
    const { rerender } = wrap(
      <SaveMeasurementForm onSubmit={vi.fn()} findRecordByDate={() => undefined} />,
    );
    fireEvent.change(screen.getByLabelText('Дата'), { target: { value: recordA.date } });
    expect(screen.getByLabelText('Вес')).toHaveValue('');

    rerender(<SaveMeasurementForm onSubmit={vi.fn()} findRecordByDate={findRecordByDate} />);

    await vi.waitFor(() => expect(screen.getByLabelText('Вес')).toHaveValue('80'));
    expect(screen.getByLabelText('Талия')).toHaveValue('82');
    expect(screen.getByLabelText('Бицепс, см')).toHaveValue('38');
  });

  it('preserves typed values when the selected record arrives and submits its existing id', async () => {
    const onSubmit = vi.fn();
    const { rerender } = wrap(
      <SaveMeasurementForm onSubmit={onSubmit} findRecordByDate={() => undefined} />,
    );
    fireEvent.change(screen.getByLabelText('Дата'), { target: { value: recordA.date } });
    await userEvent.type(screen.getByLabelText('Вес'), '73.5');
    await userEvent.type(screen.getByLabelText('Бицепс, см'), '39');

    rerender(<SaveMeasurementForm onSubmit={onSubmit} findRecordByDate={findRecordByDate} />);

    await vi.waitFor(() => expect(screen.getByLabelText('Талия')).toHaveValue('82'));
    expect(screen.getByLabelText('Вес')).toHaveValue('73.5');
    expect(screen.getByLabelText('Бицепс, см')).toHaveValue('39');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(screen.queryAllByRole('alert').map((alert) => alert.textContent)).toEqual([]);
    await vi.waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          id: recordA.id,
          date: recordA.date,
          weight: 73.5,
          waist: 82,
          custom_values: [{ slot: 1, name: 'Бицепс', unit: 'см', value: 39 }],
        }),
      ),
    );
  });
});

it('explains invalid values for new and existing dates before submitting', async () => {
  const onSubmit = vi.fn();
  wrap(<SaveMeasurementForm onSubmit={onSubmit} />);
  await userEvent.type(screen.getByLabelText('Вес'), '10000');
  expect(await screen.findByText('Максимум 9999,9')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  expect(onSubmit).not.toHaveBeenCalled();
  await userEvent.clear(screen.getByLabelText('Вес'));
  await userEvent.type(screen.getByLabelText('Вес'), '80,5');
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  await vi.waitFor(() =>
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ weight: 80.5 })),
  );
});
