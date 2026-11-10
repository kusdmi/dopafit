import { DEV_VERIFICATION_CODE } from './accounts.ts';
import type { Session } from './accounts.ts';
import type { Api } from './api.ts';
import { nextAccountLabel, runEmail } from './run-id.ts';

interface SubscriptionStatus {
  is_active: boolean;
  tier: string | null;
  ends_at: string | null;
  auto_renew: boolean;
  benefits: string[];
  manage_url: string;
}

interface ReferralInfo {
  code: string;
  link: string;
  invited_count: number;
  active_count: number;
  earned_days: number;
}

/** Prepare free Premium without creating a payment. */
export async function activateSubscription(api: Api, owner: Session): Promise<SubscriptionStatus> {
  await api.expectOk(
    'activate Premium',
    api.post('/api/v1/subscriptions/activate', owner.tokens, {}),
    200,
  );
  return api.expectOk<SubscriptionStatus>(
    'active subscription',
    api.get('/api/v1/subscriptions/status', owner.tokens),
    200,
  );
}

export function referralInfo(api: Api, owner: Session): Promise<ReferralInfo> {
  return api.expectOk<ReferralInfo>(
    'referral info',
    api.get('/api/v1/referrals/me', owner.tokens),
    200,
  );
}

/** Prepare the referred account over API when its registration UI is not the subject. */
export async function registerInvitedClient(
  api: Api,
  runId: string,
  code: string,
): Promise<Session> {
  const email = runEmail(runId, nextAccountLabel('invited'));
  await api.expectOk(
    'register invited client',
    api.anonymous('/api/v1/auth/register', {
      email,
      full_name: `Приглашённый ${runId}`,
      role: 'client',
      invite_code: code,
      personal_data_consent: true,
    }),
    201,
  );
  const invited = await api.expectOk<Session>(
    'verify invited client',
    api.anonymous('/api/v1/auth/register/verify', {
      email,
      code: DEV_VERIFICATION_CODE,
    }),
    200,
  );
  await api.expectOk(
    'onboard invited client',
    api.post('/api/v1/users/me/onboarding', invited.tokens, {
      gender: 'male',
      birth_date: '1990-05-15',
      height: 180,
      weight: 80,
    }),
    200,
  );
  return invited;
}
