import { http, HttpResponse } from 'msw';
import type { components } from '@/shared/api/schema';
import { env } from '@/shared/config/env';
const free = {
  own_programs: 1,
  client_programs: 1,
  days: 3,
  exercises: 5,
  alternatives: 2,
  clients: 10,
  registered_clients: 10,
  managed_clients: 10,
};
function initial(): components['schemas']['SubscriptionStatusOut'] {
  return {
    is_active: false,
    tier: null,
    ends_at: null,
    auto_renew: false,
    manage_url: '/subscription',
    benefits: [
      'До 100 собственных программ',
      'Аналитика за всю историю',
      'Таймер отдыха и отправка результатов',
    ],
    plans: [
      { id: 'm1', months: 1, price: 49900 },
      { id: 'm6', months: 6, price: 219000 },
      { id: 'm12', months: 12, price: 359000 },
    ],
    entitlements: {
      server_time: new Date().toISOString(),
      is_active: false,
      ends_at: null,
      limits: free,
      free_limits: free,
      features: {
        rest_timer: false,
        share_results: false,
        average_rest: false,
        analytics_days: 30,
      },
      usage: { own_programs: 0, clients: 0, registered_clients: 0, managed_clients: 0 },
      selection: {
        cycle: 'never-premium',
        required: false,
        confirmed: true,
        program_ids: [],
        client_ids: [],
      },
      programs: [],
      clients: [],
    },
  };
}
let status = initial();
export function resetSubscriptionMocks() {
  status = initial();
}
export function setMockSubscription(
  value: Partial<components['schemas']['SubscriptionStatusOut']>,
) {
  status = { ...status, ...value };
}
export const subscriptionHandlers = [
  http.get(`${env.apiUrl}/api/v1/subscriptions/status`, () => HttpResponse.json(status)),
  http.post(`${env.apiUrl}/api/v1/subscriptions/activate`, () => {
    status = {
      ...status,
      is_active: true,
      tier: 'premium',
      ends_at: null,
      auto_renew: false,
      entitlements: status.entitlements
        ? {
            ...status.entitlements,
            is_active: true,
            ends_at: null,
            limits: {
              own_programs: 100,
              client_programs: 100,
              days: 7,
              exercises: 10,
              alternatives: 5,
              clients: 100,
              registered_clients: 50,
              managed_clients: 50,
            },
            features: {
              rest_timer: true,
              share_results: true,
              average_rest: true,
              analytics_days: null,
            },
            selection: { ...status.entitlements.selection, required: false, confirmed: false },
          }
        : undefined,
    };
    return HttpResponse.json(status);
  }),
];
