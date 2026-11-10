import { useQuery } from '@tanstack/react-query';

import { fetchMeasurements } from './use-measurements';

/**
 * Lists a linked client's measurements for the owning trainer (read-only). The
 * backend scopes the result to the trainer-client card UUID and returns photos
 * empty/private (403 on the photo endpoints), so callers must NOT render a photo
 * section. Kept separate from useMeasurements (the user's own list) so the
 * offline-first cache/keys for the user's own records stay untouched.
 */
export function clientMeasurementsKey(clientId: string) {
  return ['measurements', 'client', clientId] as const;
}

export function useClientMeasurements(clientId: string | null) {
  return useQuery({
    queryKey: clientMeasurementsKey(clientId ?? ''),
    enabled: clientId !== null,
    // A client can revoke access outside this tab. Revalidate the card on every
    // visit rather than trusting a recently cached successful response.
    refetchInterval: 10_000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
    queryFn: () => fetchMeasurements(clientId!),
  });
}
