import { Icon } from '@/shared/ui/primitives';
import { checkmarkCircle } from '@/shared/ui/icons';
import { useSubscriptionStatus } from '@/entities/subscription/api/use-subscription-status';
import { formatDate } from '@/shared/lib/time/formatDate';
import { useNetworkStatus } from '@/shared/lib/network/useNetworkStatus';
import { Skeleton } from '@/shared/ui/Skeleton';
import { SettingsShell } from '../ui/SettingsShell';
import { ActivatePremiumButton } from './ActivatePremiumButton';
import { FreeSelection } from './FreeSelection';

export function SubscriptionPage() {
  const { data: status, isLoading } = useSubscriptionStatus();
  const { isOnline } = useNetworkStatus();
  return (
    <SettingsShell title="Премиум">
      {isLoading || !status ? (
        <Skeleton variant="form" count={2} />
      ) : (
        <>
          <section
            className={`flex flex-col gap-3 rounded-[20px] border p-5 ${status.is_active ? 'border-trainer-500 bg-trainer-600 text-neutral-50' : 'border-line text-content'}`}
          >
            <h2 className="text-h2">
              {status.is_active
                ? status.ends_at === null
                  ? 'Premium подключён'
                  : 'Ваша подписка активна'
                : 'Получите полный доступ ко всем функциям'}
            </h2>
            {status.is_active && status.ends_at && <p>Действует до {formatDate(status.ends_at)}</p>}
          </section>
          <section className="flex flex-col gap-3 rounded-[14px] bg-card p-4">
            <h2 className="text-h3 text-content">Что включено</h2>
            <ul className="flex flex-col gap-3">
              {status.benefits.map((b) => (
                <li key={b} className="flex items-start gap-3 text-content">
                  <Icon icon={checkmarkCircle} className="shrink-0 text-trainer-text" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </section>
          {(!status.is_active || status.ends_at !== null) && <ActivatePremiumButton online={isOnline} />}
          {status.entitlements?.selection.required && (
            <FreeSelection access={status.entitlements} online={isOnline} />
          )}
        </>
      )}
    </SettingsShell>
  );
}
