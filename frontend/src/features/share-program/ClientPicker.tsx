import { PremiumNotice } from '@/shared/ui/PremiumNotice';
import { isClientRestricted } from '@/entities/subscription/model/access';
import { useSubscriptionStatus } from '@/entities/subscription/api/use-subscription-status';
import { useClients } from '@/entities/client/api/use-clients';
import { Skeleton } from '@/shared/ui/Skeleton';

interface Props {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function ClientPicker({ selectedId, onSelect }: Props) {
  const { data, isLoading } = useClients();
  const subscription = useSubscriptionStatus();
  const access = subscription.data?.entitlements;
  if (isLoading) return <Skeleton variant="list" count={3} />;

  // Include managed stubs (client_user_id === null): sharing goes by
  // trainer_client_id, and the backend accepts stubs, so
  // the trainer can copy a program to a stub client from the UI too.
  const active = (data?.items ?? []).filter((c) => c.status === 'active');
  if (active.length === 0)
    return <p className="py-8 text-center text-body-m text-muted">Нет активных клиентов</p>;

  return (
    // Пилюли выбора клиента — та же форма, что на старте тренировки
    // (Figma 1009:2138): выбранная залита акцентом, остальные на обводке.
    <ul role="radiogroup" aria-label="Выберите клиента" className="flex flex-col gap-[10px]">
      {active.map((c) => {
        const selected = c.id === selectedId;
        return (
          <li key={c.id}>
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={
                !!access && !subscription.data?.is_active && isClientRestricted(access, c.id)
              }
              onClick={() => onSelect(c.id)}
              className={`flex w-full items-center justify-center rounded-[14px] border p-[10px] text-body-m ${
                selected
                  ? 'border-brand-400 bg-brand-400 text-chart-1-fg'
                  : 'border-line text-content'
              }`}
            >
              {c.display_name}
            </button>
            {access && isClientRestricted(access, c.id) && (
              <PremiumNotice
                title="Доступ к клиенту"
                description="Клиент вне бесплатного выбора. Подтвердите выбор клиентов в разделе Premium или подключите расширенный доступ."
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
