import { useMutation } from '@tanstack/react-query';

import { api, toApiError } from '@/shared/api/client';
import type { components } from '@/shared/api/schema';
import { trackMetrikaGoal } from '@/shared/lib/telemetry/metrika';

type OnboardingRequest = components['schemas']['OnboardingRequest'];

export function useCompleteOnboarding() {
  return useMutation({
    mutationFn: async (body: OnboardingRequest) => {
      const { data, error } = await api.POST('/api/v1/users/me/onboarding', { body });
      if (error) {
        throw toApiError(error);
      }
      return data;
    },
    onSuccess: () => trackMetrikaGoal('registration_completed'),
  });
}
