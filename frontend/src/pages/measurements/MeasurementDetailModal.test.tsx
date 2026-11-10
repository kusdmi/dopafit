import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { MeasurementDetailModal } from './MeasurementDetailModal';

const mockUseMeasurement = vi.fn();
vi.mock('@/entities/measurement/api/use-measurement', () => ({
  useMeasurement: () => mockUseMeasurement(),
}));
vi.mock('@/entities/measurement/ui/PrivatePhoto', () => ({
  PrivatePhoto: ({ url, alt }: { url: string; alt: string }) => <img data-private-url={url} alt={alt} />,
}));

function wrap(ui: ReactNode) {
  return render(<>{ui}</>);
}

describe('MeasurementDetailModal photos', () => {
  it('renders a preview image for each attached photo in canonical order', () => {
    mockUseMeasurement.mockReturnValue({
      isLoading: false,
      data: {
        id: 'r1',
        date: '2026-06-12',
        weight: 83,
        custom_values: [],
        // Intentionally out of canonical order to assert sorting.
        photos: [
          { kind: 'back', url: '/api/v1/measurements/r1/photos/back/content' },
          { kind: 'front', url: '/api/v1/measurements/r1/photos/front/content' },
        ],
      },
    });

    wrap(
      <MeasurementDetailModal
        id="r1"
        isOpen
        onClose={vi.fn()}
        onLoad={vi.fn()}
        onDelete={vi.fn()}
        isOnline
      />,
    );

    expect(screen.getByRole('heading', { name: 'Фотографии' })).toBeInTheDocument();
    const imgs = screen.getAllByRole('img');
    expect(imgs.map((i) => i.getAttribute('alt'))).toEqual(['Спереди', 'Сзади']);
    expect(imgs[0]).toHaveAttribute(
      'data-private-url',
      '/api/v1/measurements/r1/photos/front/content',
    );
  });

  it('omits the photos section when there are no photos', () => {
    mockUseMeasurement.mockReturnValue({
      isLoading: false,
      data: { id: 'r2', date: '2026-06-13', weight: 80, custom_values: [], photos: [] },
    });

    wrap(
      <MeasurementDetailModal
        id="r2"
        isOpen
        onClose={vi.fn()}
        onLoad={vi.fn()}
        onDelete={vi.fn()}
        isOnline
      />,
    );

    expect(screen.queryByRole('heading', { name: 'Фотографии' })).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('disables deletion while offline', () => {
    mockUseMeasurement.mockReturnValue({
      isLoading: false,
      data: { id: 'r2', date: '2026-06-13', weight: 80, custom_values: [], photos: [] },
    });
    wrap(
      <MeasurementDetailModal
        id="r2"
        isOpen
        onClose={vi.fn()}
        onLoad={vi.fn()}
        onDelete={vi.fn()}
        isOnline={false}
      />,
    );
    expect(screen.getByRole('button', { name: 'Удалить замер' })).toBeDisabled();
  });
});

// Макет 758:2726: значения выводятся плитками «подпись + значение с единицей»,
// а заголовок модалки несёт дату записи.
describe('MeasurementDetailModal values', () => {
  it('shows only the fields actually recorded, each with its unit', () => {
    mockUseMeasurement.mockReturnValue({
      isLoading: false,
      data: {
        id: 'r3',
        date: '2026-01-23',
        height: 175,
        weight: 70,
        // Талия/грудь НЕ записаны — их в модалке быть не должно.
        biceps: 38,
        custom_values: [],
        photos: [],
      },
    });

    wrap(
      <MeasurementDetailModal
        id="r3"
        isOpen
        onClose={vi.fn()}
        onLoad={vi.fn()}
        onDelete={vi.fn()}
        isOnline
      />,
    );

    expect(screen.getByText('Рост')).toBeInTheDocument();
    expect(screen.getByText('175 см')).toBeInTheDocument();
    // Вес — единственное поле в килограммах.
    expect(screen.getByText('70 кг')).toBeInTheDocument();
    // Дополнительный обхват показывается такой же плиткой, а не прячется.
    expect(screen.getByText('Бицепс')).toBeInTheDocument();
    expect(screen.getByText('38 см')).toBeInTheDocument();
    // Незаполненные поля отсутствуют полностью.
    expect(screen.queryByText('Талия')).not.toBeInTheDocument();
    expect(screen.queryByText('Грудь')).not.toBeInTheDocument();
  });

  it('puts the record date in the modal title', () => {
    mockUseMeasurement.mockReturnValue({
      isLoading: false,
      data: { id: 'r4', date: '2026-01-23', weight: 70, custom_values: [], photos: [] },
    });

    wrap(
      <MeasurementDetailModal
        id="r4"
        isOpen
        onClose={vi.fn()}
        onLoad={vi.fn()}
        onDelete={vi.fn()}
        isOnline
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Запись за 23 января 2026' }),
    ).toBeInTheDocument();
  });

  it('renders custom fields with their own name and unit', () => {
    mockUseMeasurement.mockReturnValue({
      isLoading: false,
      data: {
        id: 'r5',
        date: '2026-01-23',
        weight: 70,
        custom_values: [{ slot: 1, name: 'Бицепс левый', unit: 'см', value: 37.5 }],
        photos: [],
      },
    });

    wrap(
      <MeasurementDetailModal
        id="r5"
        isOpen
        onClose={vi.fn()}
        onLoad={vi.fn()}
        onDelete={vi.fn()}
        isOnline
      />,
    );

    expect(screen.getByText('Бицепс левый')).toBeInTheDocument();
    expect(screen.getByText('37.5 см')).toBeInTheDocument();
  });
});
