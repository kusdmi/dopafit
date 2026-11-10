import { setMockSubscription } from '@/entities/subscription/api/mocks';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { useState, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resetMeasurementStore, seedCustomField } from '@/entities/measurement/api/mocks';
import { server } from '@/app/mocks/server';
import { env } from '@/shared/config/env';
import { anthropometryKey } from '@/entities/analytics/api/use-anthropometry-series';

import { AnthropometryChart } from './AnthropometryChart';
import { AnthropometryControls } from '../view/AnthropometryControls';
import type { AnalyticsView } from '../view/useAnalyticsView';

/** A view with everything at its default, overridden per test. */
function viewWith(over: Partial<AnalyticsView> = {}): AnalyticsView {
  return {
    tab: 'anthropometry',
    clientId: null,
    workoutView: 'program',
    programId: '',
    dayId: '',
    exerciseId: '',
    metric: 'weight',
    dateFrom: '2026-04-01',
    dateTo: '2026-06-01',
    parameters: ['weight'],
    customSlots: [],
    ...over,
  };
}

function wrap(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('anthropometry custom fields in analytics (B010)', () => {
  beforeEach(() => {
    resetMeasurementStore();
    seedCustomField({ slot: 1, name: 'Жир %', unit: '%' });
  });
  afterEach(() => resetMeasurementStore());

  it('offers the user custom fields on the screen and toggles their slot', async () => {
    const changes: Partial<AnalyticsView>[] = [];
    const Harness = () => {
      const [view, setView] = useState<AnalyticsView>(viewWith());
      return (
        <AnthropometryControls
          view={view}
          patch={(next) => {
            changes.push(next);
            setView((v) => ({ ...v, ...next }));
          }}
        />
      );
    };

    wrap(<Harness />);

    const customButton = await screen.findByRole('button', { name: /Жир %/ });
    await userEvent.click(customButton);
    await waitFor(() => expect(changes.at(-1)?.customSlots).toEqual([1]));

    // Toggling off removes the slot again.
    await userEvent.click(screen.getByRole('button', { name: /Жир %/ }));
    await waitFor(() => expect(changes.at(-1)?.customSlots).toEqual([]));
  });

  it('shows the CLIENT custom fields (not the trainer own) in Клиент mode (BL-8)', async () => {
    // The shared store holds the trainer's own field "Жир %"; the client_id query
    // must instead surface the linked client's fields.
    let requestedClientId: string | null = null;
    server.use(
      http.get(`${env.apiUrl}/api/v1/measurements/custom-fields`, ({ request }) => {
        requestedClientId = new URL(request.url).searchParams.get('client_id');
        if (requestedClientId) {
          return HttpResponse.json([{ slot: 2, name: 'Пульс покоя', unit: 'уд/мин' }]);
        }
        return HttpResponse.json([{ slot: 1, name: 'Жир %', unit: '%' }]);
      }),
    );

    wrap(
      <AnthropometryControls view={viewWith({ clientId: 'client-linked-1' })} patch={() => {}} />,
    );

    // The client's field name is offered; the trainer's own is not.
    await screen.findByRole('button', { name: /Пульс покоя/ });
    expect(requestedClientId).toBe('client-linked-1');
    expect(screen.queryByRole('button', { name: /Жир %/ })).not.toBeInTheDocument();
  });

  it('renders a custom series (name + unit) alongside standard params', async () => {
    wrap(
      <AnthropometryChart
        params={{ parameters: ['weight'], customSlots: [1] }}
        dateFrom="2026-04-01"
        dateTo="2026-06-01"
        clientId={null}
      />,
    );

    // Standard param card and the custom-field card both render. Each label
    // now appears twice (parameter card + chart legend), so assert on the
    // count rather than a unique match.
    await waitFor(() => expect(screen.getAllByText('Вес').length).toBeGreaterThan(0));
    expect(screen.getAllByText('Жир %').length).toBeGreaterThan(0);
    // The custom series carries its unit (%) in the min/max stats.
    expect(screen.getByText('15 %')).toBeInTheDocument();
    expect(screen.getByText('20 %')).toBeInTheDocument();
  });

  it('hides a linked client chart restored from cache when access was revoked', async () => {
    const params = {
      dateFrom: '2026-04-01',
      dateTo: '2026-06-01',
      parameters: ['weight'] as const,
      customSlots: [1],
      clientId: 'client-linked-1',
    };
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(anthropometryKey({ ...params, parameters: ['weight'] }), {
      parameters: [
        {
          parameter: null,
          custom_slot: 1,
          name: 'Секретный замер',
          unit: 'кг',
          points: [{ date: '2026-05-01', value: 80 }],
          stats: { min: 80, avg: 80, max: 80, change_percent: null },
        },
      ],
    });
    server.use(
      http.get(`${env.apiUrl}/api/v1/analytics/anthropometry/series`, () =>
        HttpResponse.json({ code: 'not_found', message: 'Client not found' }, { status: 404 }),
      ),
    );

    render(
      <QueryClientProvider client={qc}>
        <AnthropometryChart
          params={{ parameters: ['weight'], customSlots: [1] }}
          dateFrom={params.dateFrom}
          dateTo={params.dateTo}
          clientId={params.clientId}
        />
      </QueryClientProvider>,
    );
    expect(screen.queryByText('Секретный замер')).not.toBeInTheDocument();
    expect(await screen.findByText('Не удалось загрузить данные клиента')).toBeInTheDocument();
    expect(screen.queryByText('Секретный замер')).not.toBeInTheDocument();
  });
});

beforeEach(() =>
  setMockSubscription({
    is_active: true,
    ends_at: '2099-01-01T00:00:00Z',
    entitlements: undefined,
  }),
);
