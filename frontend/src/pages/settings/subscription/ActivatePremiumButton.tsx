import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, toApiError } from '@/shared/api/client';
import { Button } from '@/shared/ui/Button';
import { subscriptionStatusQueryKey } from '@/entities/subscription/api/use-subscription-status';
import { trackMetrikaGoal } from '@/shared/lib/telemetry/metrika';

export function ActivatePremiumButton({ online }: { online: boolean }) {
  const qc = useQueryClient();
  const activation = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST('/api/v1/subscriptions/activate');
      if (error || !data) throw toApiError(error);
      return data;
    },
    onSuccess: async (data) => {
      qc.setQueryData(subscriptionStatusQueryKey, data);
      trackMetrikaGoal('premium_activated');
      await Promise.all(
        ['subscription', 'analytics', 'programs', 'clients'].map((key) =>
          qc.invalidateQueries({ queryKey: [key] }),
        ),
      );
    },
  });
  return (
    <>
      <Button
        disabled={!online || activation.isPending}
        loading={activation.isPending}
        onClick={() => {
          if (!activation.isPending) activation.mutate();
        }}
      >
        Подключить Premium бесплатно
      </Button>
      {!online && <p className="text-body-s text-muted">Для подключения Premium нужен интернет.</p>}
      {activation.isError && (
        <p role="alert" className="text-body-s text-danger">
          Не удалось подключить Premium. Попробуйте ещё раз.
        </p>
      )}
    </>
  );
}
