import { useSubscriptionStatus } from '../api/use-subscription-status';
import { useNetworkStatus } from '@/shared/lib/network/useNetworkStatus';
import { Button } from '@/shared/ui/Button';

export function SubscriptionStatusNotice() {
  const query = useSubscriptionStatus();
  const { isOnline } = useNetworkStatus();
  if (query.data) return null;
  return (
    <div className="text-body-s text-muted" role="status">
      <p>
        {!isOnline
          ? 'Для проверки доступа нужен интернет. Сохранённые данные тренировки доступны.'
          : query.isError
            ? 'Не удалось проверить доступ к функциям.'
            : 'Проверяем доступ к функциям…'}
      </p>
      {query.isError && (
        <Button
          variant="ghost"
          disabled={!isOnline || query.isFetching}
          onClick={() => void query.refetch()}
        >
          Повторить проверку доступа
        </Button>
      )}
    </div>
  );
}
