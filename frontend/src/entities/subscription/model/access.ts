import type { components } from '@/shared/api/schema';

type Access = components['schemas']['EntitlementsOut'];

export function isClientRestricted(access: Access, id: string): boolean {
  return (
    !access.is_active &&
    (!access.selection.client_ids.includes(id) ||
      (access.selection.required && access.clients.length > access.limits.clients))
  );
}

export function isProgramGroupPending(access: Access, clientId: string | null): boolean {
  const group = access.programs.filter((p) => p.client_id === clientId);
  const limit = clientId ? access.limits.client_programs : access.limits.own_programs;
  return (
    !access.is_active &&
    access.selection.required &&
    (group.length > limit || group.some((p) => !p.compatible))
  );
}

export function isProgramRestricted(access: Access, id: string): boolean {
  const resource = access.programs.find((p) => p.id === id);
  return (
    !!resource &&
    !access.is_active &&
    (!resource.compatible ||
      !access.selection.program_ids.includes(id) ||
      isProgramGroupPending(access, resource.client_id) ||
      (!!resource.client_id && isClientRestricted(access, resource.client_id)))
  );
}

/** null means rights have not been loaded, rather than a free subscription. */
export function featureEnabled(
  status: import('@/shared/api/schema').components['schemas']['SubscriptionStatusOut'] | undefined,
  feature: 'rest_timer' | 'average_rest' | 'share_results',
): boolean | null {
  return status ? status.is_active && status.entitlements?.features[feature] !== false : null;
}
